import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type { PluginRuntime } from "../../../src/plugins/runtime/types.js";
import type { ResolvedSmsAccount } from "./types.js";

// The outbound reply path is mocked so the `deliver` callback can be asserted
// without hitting the Twilio REST API.
const sendSmsTextChunks = vi.hoisted(() => vi.fn(async () => []));
vi.mock("./send.js", () => ({ sendSmsTextChunks }));

const { clearSmsWebhookRateLimitStateForTest, createSmsWebhookHandler } =
  await import("./inbound.js");
const { computeTwilioSignature } = await import("./twilio.js");

const AUTH_TOKEN = "test-auth-token-not-a-real-secret";
const PUBLIC_URL = "https://sms.example.test/webhooks/sms";
const SENDER = "+15550001111";
const RECEIVER = "+15559998888";

function baseAccount(overrides: Partial<ResolvedSmsAccount> = {}): ResolvedSmsAccount {
  return {
    accountId: "default",
    enabled: true,
    accountSid: "AC00000000000000000000000000000000",
    authToken: AUTH_TOKEN,
    fromNumber: RECEIVER,
    messagingServiceSid: "",
    defaultTo: "",
    webhookPath: "/webhooks/sms",
    publicWebhookUrl: PUBLIC_URL,
    dangerouslyDisableSignatureValidation: false,
    dmPolicy: "allowlist",
    allowFrom: [SENDER],
    textChunkLimit: 1500,
    ...overrides,
  };
}

type RuntimeSpies = {
  runtime: PluginRuntime;
  finalizeInboundContext: ReturnType<typeof vi.fn>;
  recordInboundSession: ReturnType<typeof vi.fn>;
  dispatchReply: ReturnType<typeof vi.fn>;
  resolveAgentRoute: ReturnType<typeof vi.fn>;
  readAllowFromStore: ReturnType<typeof vi.fn>;
};

/**
 * Fake PluginRuntime exposing only the facets the inbound seam touches.
 * `shouldComputeCommandAuthorized` defaults to true so `CommandAuthorized`
 * is actually computed (and therefore assertable) on every message.
 */
function createRuntime(
  params: {
    cfg?: RemoteClawConfig;
    account?: ResolvedSmsAccount;
    storeAllowFrom?: string[];
    shouldComputeCommandAuthorized?: boolean;
  } = {},
): RuntimeSpies {
  const cfg = params.cfg ?? ({} as RemoteClawConfig);
  const finalizeInboundContext = vi.fn((ctx: Record<string, unknown>) => ({
    ...ctx,
    // Mirror the real normalizer's default-deny collapse.
    CommandAuthorized: ctx.CommandAuthorized === true,
  }));
  const recordInboundSession = vi.fn(async () => {});
  const dispatchReply = vi.fn(
    async (args: { dispatcherOptions: { deliver: (payload: { text?: string }) => unknown } }) => {
      await args.dispatcherOptions.deliver({ text: "agent reply" });
      return {};
    },
  );
  const resolveAgentRoute = vi.fn(() => ({
    agentId: "main",
    sessionKey: "sms:default:+15550001111",
  }));
  const readAllowFromStore = vi.fn(async () => params.storeAllowFrom ?? []);

  const runtime = {
    config: { loadConfig: () => cfg },
    channel: {
      reply: {
        finalizeInboundContext,
        dispatchReplyWithBufferedBlockDispatcher: dispatchReply,
        resolveEnvelopeFormatOptions: () => ({}),
        formatAgentEnvelope: ({ body }: { body: string }) => body,
      },
      routing: { resolveAgentRoute },
      session: {
        resolveStorePath: () => "/tmp/sms-test-sessions.json",
        readSessionUpdatedAt: () => undefined,
        recordInboundSession,
      },
      pairing: { readAllowFromStore },
      commands: {
        shouldComputeCommandAuthorized: () => params.shouldComputeCommandAuthorized !== false,
        resolveCommandAuthorizedFromAuthorizers: ({
          authorizers,
        }: {
          authorizers: Array<{ configured: boolean; allowed: boolean }>;
        }) => authorizers.some((entry) => entry.configured && entry.allowed),
      },
    },
  } as unknown as PluginRuntime;

  return {
    runtime,
    finalizeInboundContext,
    recordInboundSession,
    dispatchReply,
    resolveAgentRoute,
    readAllowFromStore,
  };
}

function formBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    From: SENDER,
    To: RECEIVER,
    Body: "hello agent",
    AccountSid: "AC00000000000000000000000000000000",
    MessageSid: "SM00000000000000000000000000000001",
    ...overrides,
  };
}

function encodeForm(form: Record<string, string>): string {
  return new URLSearchParams(form).toString();
}

async function withServer(
  handler: RequestListener,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("missing server address");
  }
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

type PostOptions = {
  account?: ResolvedSmsAccount;
  runtime?: RuntimeSpies;
  form?: Record<string, string>;
  /** "valid" signs the form, "invalid" sends garbage, "none" omits the header. */
  signature?: "valid" | "invalid" | "none";
  method?: string;
  log?: { info?: unknown; warn?: unknown; error?: unknown; debug?: unknown };
  path?: string;
  /** Token used to SIGN the request; defaults to the module-level AUTH_TOKEN. */
  signingToken?: string;
};

async function post(options: PostOptions = {}): Promise<{ status: number; body: string }> {
  const account = options.account ?? baseAccount();
  const spies = options.runtime ?? createRuntime({ account });
  const form = options.form ?? formBody();
  const handler = createSmsWebhookHandler({
    account,
    cfg: {} as RemoteClawConfig,
    runtime: spies.runtime,
    log: options.log as never,
  });

  let result = { status: 0, body: "" };
  await withServer(
    async (req, res) => {
      const handled = await handler(req, res);
      if (!handled) {
        res.statusCode = 404;
        res.end("not found");
      }
    },
    async (baseUrl) => {
      const headers: Record<string, string> = {
        "content-type": "application/x-www-form-urlencoded",
      };
      if (options.signature !== "none") {
        headers["x-twilio-signature"] =
          options.signature === "invalid"
            ? "AAAAAAAAAAAAAAAAAAAAAAAAAAA="
            : computeTwilioSignature({
                url: PUBLIC_URL,
                authToken: options.signingToken ?? AUTH_TOKEN,
                form,
              });
      }
      const response = await fetch(`${baseUrl}${options.path ?? "/webhooks/sms"}`, {
        method: options.method ?? "POST",
        headers,
        body: options.method === "GET" ? undefined : encodeForm(form),
      });
      result = { status: response.status, body: await response.text() };
    },
  );
  return result;
}

beforeEach(() => {
  clearSmsWebhookRateLimitStateForTest();
  sendSmsTextChunks.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sms inbound webhook — signature validation is fail-closed", () => {
  it("rejects a POST with NO X-Twilio-Signature and never reaches the runtime", async () => {
    const spies = createRuntime();
    const result = await post({ runtime: spies, signature: "none" });

    expect(result.status).toBe(403);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
    expect(spies.finalizeInboundContext).not.toHaveBeenCalled();
    expect(spies.recordInboundSession).not.toHaveBeenCalled();
    expect(sendSmsTextChunks).not.toHaveBeenCalled();
  });

  it("rejects a POST with an INVALID X-Twilio-Signature and never reaches the runtime", async () => {
    const spies = createRuntime();
    const result = await post({ runtime: spies, signature: "invalid" });

    expect(result.status).toBe(403);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
    expect(spies.finalizeInboundContext).not.toHaveBeenCalled();
    expect(sendSmsTextChunks).not.toHaveBeenCalled();
  });

  it("rejects a signature computed over TAMPERED form params", async () => {
    const spies = createRuntime();
    const signedForm = formBody();
    const handler = createSmsWebhookHandler({
      account: baseAccount(),
      cfg: {} as RemoteClawConfig,
      runtime: spies.runtime,
    });
    const signature = computeTwilioSignature({
      url: PUBLIC_URL,
      authToken: AUTH_TOKEN,
      form: signedForm,
    });

    let status = 0;
    await withServer(
      async (req, res) => {
        await handler(req, res);
      },
      async (baseUrl) => {
        // Same signature, mutated body: the attacker swaps the message text.
        const response = await fetch(`${baseUrl}/webhooks/sms`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-twilio-signature": signature,
          },
          body: encodeForm({ ...signedForm, Body: "/deploy production" }),
        });
        status = response.status;
      },
    );

    expect(status).toBe(403);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the WRONG auth token", async () => {
    const spies = createRuntime();
    const form = formBody();
    const handler = createSmsWebhookHandler({
      account: baseAccount(),
      cfg: {} as RemoteClawConfig,
      runtime: spies.runtime,
    });

    let status = 0;
    await withServer(
      async (req, res) => {
        await handler(req, res);
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/webhooks/sms`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-twilio-signature": computeTwilioSignature({
              url: PUBLIC_URL,
              authToken: "attacker-guessed-token",
              form,
            }),
          },
          body: encodeForm(form),
        });
        status = response.status;
      },
    );

    expect(status).toBe(403);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("accepts a VALID signature and proceeds to the runtime", async () => {
    const spies = createRuntime();
    const result = await post({ runtime: spies, signature: "valid" });

    expect(result.status).toBe(200);
    expect(spies.dispatchReply).toHaveBeenCalledTimes(1);
  });

  it("never echoes a secret or signature back to the caller", async () => {
    const rejected = await post({ signature: "invalid" });
    const accepted = await post({ signature: "valid" });

    for (const body of [rejected.body, accepted.body]) {
      expect(body).toBe("<Response></Response>");
      expect(body).not.toContain(AUTH_TOKEN);
    }
  });
});

describe("sms inbound webhook — dangerouslyDisableSignatureValidation", () => {
  it("is OFF by default: an unsigned POST is rejected", async () => {
    const spies = createRuntime();
    const result = await post({
      runtime: spies,
      // `dangerouslyDisableSignatureValidation` intentionally left at its
      // resolved default (false) here.
      account: baseAccount(),
      signature: "none",
    });

    expect(result.status).toBe(403);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("when explicitly enabled, an unsigned POST proceeds AND logs a loud warning", async () => {
    const spies = createRuntime();
    const warn = vi.fn();
    const result = await post({
      runtime: spies,
      account: baseAccount({ dangerouslyDisableSignatureValidation: true }),
      signature: "none",
      log: { warn },
    });

    expect(result.status).toBe(200);
    expect(spies.dispatchReply).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    const warning = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(warning).toContain("UNAUTHENTICATED");
    expect(warning).toContain("dangerouslyDisableSignatureValidation");
  });
});

describe("sms inbound webhook — authorization is default-deny", () => {
  it("drops a sender that is NOT allowlisted under a restrictive dmPolicy", async () => {
    const spies = createRuntime();
    const result = await post({
      runtime: spies,
      account: baseAccount({ dmPolicy: "allowlist", allowFrom: ["+15557776666"] }),
      signature: "valid",
    });

    // ACK to Twilio, but the message never reaches the agent runtime.
    expect(result.status).toBe(200);
    expect(spies.finalizeInboundContext).not.toHaveBeenCalled();
    expect(spies.dispatchReply).not.toHaveBeenCalled();
    expect(sendSmsTextChunks).not.toHaveBeenCalled();
  });

  it("drops every sender when the allowlist is EMPTY (unconfigured allowlist policy)", async () => {
    const spies = createRuntime();
    const result = await post({
      runtime: spies,
      account: baseAccount({ dmPolicy: "allowlist", allowFrom: [] }),
      signature: "valid",
    });

    expect(result.status).toBe(200);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("drops everything when dmPolicy is disabled, even for an allowlisted sender", async () => {
    const spies = createRuntime();
    const result = await post({
      runtime: spies,
      account: baseAccount({ dmPolicy: "disabled", allowFrom: [SENDER] }),
      signature: "valid",
    });

    expect(result.status).toBe(200);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("passes CommandAuthorized=false for a non-allowlisted sender under an OPEN dmPolicy", async () => {
    const spies = createRuntime();
    const result = await post({
      runtime: spies,
      account: baseAccount({ dmPolicy: "open", allowFrom: ["+15557776666"] }),
      signature: "valid",
    });

    expect(result.status).toBe(200);
    expect(spies.finalizeInboundContext).toHaveBeenCalledTimes(1);
    const ctx = spies.finalizeInboundContext.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(ctx.CommandAuthorized).toBe(false);
    // Reached the agent (open policy), but without command authority.
    expect(spies.dispatchReply).toHaveBeenCalledTimes(1);
  });

  it("passes CommandAuthorized=true for an allowlisted sender", async () => {
    const spies = createRuntime();
    const result = await post({
      runtime: spies,
      account: baseAccount({ dmPolicy: "allowlist", allowFrom: [SENDER] }),
      signature: "valid",
    });

    expect(result.status).toBe(200);
    const ctx = spies.finalizeInboundContext.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(ctx.CommandAuthorized).toBe(true);
  });

  it("honors a sender paired via the allow-from store under the pairing policy", async () => {
    const denied = createRuntime({ storeAllowFrom: [] });
    const deniedResult = await post({
      runtime: denied,
      account: baseAccount({ dmPolicy: "pairing", allowFrom: [] }),
      signature: "valid",
    });
    expect(deniedResult.status).toBe(200);
    expect(denied.dispatchReply).not.toHaveBeenCalled();

    const allowed = createRuntime({ storeAllowFrom: [SENDER] });
    const allowedResult = await post({
      runtime: allowed,
      account: baseAccount({ dmPolicy: "pairing", allowFrom: [] }),
      signature: "valid",
      // Distinct MessageSid: this is a SECOND inbound message, not a redelivery
      // of the one above, so it must not be swallowed by the replay dedup.
      form: formBody({ MessageSid: "SM00000000000000000000000000000002" }),
    });
    expect(allowedResult.status).toBe(200);
    expect(allowed.dispatchReply).toHaveBeenCalledTimes(1);
  });
});

describe("sms inbound webhook — delivery seam", () => {
  it("runs route → context → session → dispatch and replies over the Twilio REST path", async () => {
    const spies = createRuntime();
    const result = await post({ runtime: spies, signature: "valid" });

    expect(result.status).toBe(200);

    // 1. Route resolve (peer.kind is "direct" — SMS is strictly 1:1).
    expect(spies.resolveAgentRoute).toHaveBeenCalledTimes(1);
    const routeArgs = spies.resolveAgentRoute.mock.calls[0]?.[0] as {
      channel: string;
      accountId: string;
      peer: { kind: string; id: string };
    };
    expect(routeArgs.channel).toBe("sms");
    expect(routeArgs.accountId).toBe("default");
    expect(routeArgs.peer).toEqual({ kind: "direct", id: SENDER });

    // 2. Inbound context.
    const ctx = spies.finalizeInboundContext.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(ctx.From).toBe(`sms:${SENDER}`);
    expect(ctx.To).toBe(`sms:${RECEIVER}`);
    expect(ctx.Provider).toBe("sms");
    expect(ctx.Surface).toBe("sms");
    expect(ctx.ChatType).toBe("direct");
    expect(ctx.MessageSid).toBe("SM00000000000000000000000000000001");
    expect(ctx.SessionKey).toBe("sms:default:+15550001111");

    // 3. Session recorded.
    expect(spies.recordInboundSession).toHaveBeenCalledTimes(1);

    // 4. Dispatch, and the deliver callback sends via the SMS send path.
    expect(spies.dispatchReply).toHaveBeenCalledTimes(1);
    expect(sendSmsTextChunks).toHaveBeenCalledTimes(1);
    expect(sendSmsTextChunks).toHaveBeenCalledWith({
      account: expect.objectContaining({ accountId: "default" }),
      to: SENDER,
      text: "agent reply",
    });
  });

  it("does not send an empty reply block", async () => {
    const spies = createRuntime();
    spies.dispatchReply.mockImplementation(
      async (args: { dispatcherOptions: { deliver: (p: { text?: string }) => unknown } }) => {
        await args.dispatcherOptions.deliver({ text: "   " });
        return {};
      },
    );

    await post({ runtime: spies, signature: "valid" });
    expect(sendSmsTextChunks).not.toHaveBeenCalled();
  });

  it("rejects a malformed Twilio payload with 400 before any delivery", async () => {
    const spies = createRuntime();
    const result = await post({
      runtime: spies,
      signature: "valid",
      // No MessageSid / Body ⇒ buildTwilioInboundMessage returns null.
      form: { From: SENDER, To: RECEIVER },
    });

    expect(result.status).toBe(400);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("ACKs with 200 when the runtime throws, so Twilio does not retry-storm", async () => {
    const spies = createRuntime();
    spies.dispatchReply.mockRejectedValue(new Error("agent exploded"));
    const error = vi.fn();

    const result = await post({ runtime: spies, signature: "valid", log: { error } });

    expect(result.status).toBe(200);
    expect(error).toHaveBeenCalled();
  });

  it("never writes the account auth token into the catch-path log", async () => {
    // The top-level catch is the one place that logs an arbitrary downstream
    // failure, and it has the whole `account` (auth token included) in scope.
    // Pin that the line it emits is built from the account id and the error
    // only — a future "log the account for debugging" edit must fail here
    // rather than spill a Twilio credential into the gateway log.
    const SENTINEL_TOKEN = "sentinel-token-must-never-be-logged";
    const spies = createRuntime();
    // Fail a post-signature downstream seam so the catch is what runs.
    spies.finalizeInboundContext.mockImplementation(() => {
      throw new Error("downstream seam exploded");
    });
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

    const result = await post({
      runtime: spies,
      account: baseAccount({ authToken: SENTINEL_TOKEN }),
      signingToken: SENTINEL_TOKEN,
      signature: "valid",
      log,
    });

    // The request got far enough to hit the catch (signature verified against
    // the sentinel token, so the token really was the live credential here).
    expect(result.status).toBe(200);
    expect(spies.finalizeInboundContext).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalled();

    const logged = [log.error, log.warn, log.info, log.debug]
      .flatMap((fn) => fn.mock.calls)
      .map((call) => String(call[0]))
      .join("\n");
    expect(logged).toContain("inbound webhook failed");
    expect(logged).not.toContain(SENTINEL_TOKEN);
    // And nothing is echoed to the caller either.
    expect(result.body).not.toContain(SENTINEL_TOKEN);
  });
});

describe("sms inbound webhook — MessageSid replay dedup", () => {
  it("delivers a MessageSid ONCE: the replayed POST is ACKed but never re-delivered", async () => {
    // Twilio signatures carry no timestamp or nonce, so this second request is
    // byte-identical to the first and just as signature-valid (#3035).
    const spies = createRuntime();
    const form = formBody({ MessageSid: "SM000000000000000000000000000000aa" });

    const first = await post({ runtime: spies, signature: "valid", form });
    const replay = await post({ runtime: spies, signature: "valid", form });

    expect(first.status).toBe(200);
    // The replay is ACKed exactly like the original — it learns nothing from
    // the response, and a legitimate Twilio retry is satisfied.
    expect(replay.status).toBe(200);
    expect(replay.body).toBe("<Response></Response>");

    // The real delivery seam ran exactly once: the replay never reached the
    // runtime, the session store, or the outbound SMS path.
    expect(spies.dispatchReply).toHaveBeenCalledTimes(1);
    expect(spies.finalizeInboundContext).toHaveBeenCalledTimes(1);
    expect(spies.recordInboundSession).toHaveBeenCalledTimes(1);
    expect(sendSmsTextChunks).toHaveBeenCalledTimes(1);
  });

  it("delivers BOTH when two POSTs carry different MessageSids", async () => {
    // Identical body, different sid: the dedup must key on the sid alone and
    // must not coalesce two genuinely distinct inbound messages.
    const spies = createRuntime();

    const first = await post({
      runtime: spies,
      signature: "valid",
      form: formBody({ MessageSid: "SM000000000000000000000000000000ab" }),
    });
    const second = await post({
      runtime: spies,
      signature: "valid",
      form: formBody({ MessageSid: "SM000000000000000000000000000000ac" }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(spies.dispatchReply).toHaveBeenCalledTimes(2);
    expect(spies.finalizeInboundContext).toHaveBeenCalledTimes(2);
    expect(sendSmsTextChunks).toHaveBeenCalledTimes(2);
  });
});

describe("sms inbound webhook — request guards", () => {
  it("rejects non-POST methods with 405", async () => {
    const spies = createRuntime();
    const result = await post({ runtime: spies, method: "GET", signature: "valid" });

    expect(result.status).toBe(405);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("rate-limits a flood of unauthenticated POSTs from one client", async () => {
    const account = baseAccount();
    const spies = createRuntime();
    const handler = createSmsWebhookHandler({
      account,
      cfg: {} as RemoteClawConfig,
      runtime: spies.runtime,
    });

    let sawRateLimit = false;
    await withServer(
      async (req, res) => {
        await handler(req, res);
      },
      async (baseUrl) => {
        for (let i = 0; i < 400; i += 1) {
          const response = await fetch(`${baseUrl}/webhooks/sms`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: encodeForm(formBody()),
          });
          if (response.status === 429) {
            sawRateLimit = true;
            break;
          }
        }
      },
    );

    expect(sawRateLimit).toBe(true);
    expect(spies.dispatchReply).not.toHaveBeenCalled();
  });

  it("never reads config from disk while serving a request", async () => {
    // A per-request `loadConfig()` on this PUBLIC pre-auth route would let
    // unauthenticated traffic amplify into blocking synchronous disk reads.
    // The handler must use only the registration-time snapshot.
    const loadConfig = vi.fn(() => ({}) as RemoteClawConfig);
    const spies = createRuntime();
    (spies.runtime as unknown as { config: { loadConfig: unknown } }).config = { loadConfig };

    await post({ runtime: spies, signature: "valid" });
    await post({ runtime: spies, signature: "none" });

    expect(loadConfig).not.toHaveBeenCalled();
  });
});
