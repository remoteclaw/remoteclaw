import { request } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { VoiceCallConfigSchema, type VoiceCallConfig } from "./config.js";
import type { CallManager } from "./manager.js";
import type { VoiceCallProvider } from "./providers/base.js";
import { VoiceCallWebhookServer } from "./webhook.js";

const provider: VoiceCallProvider = {
  name: "mock",
  verifyWebhook: () => ({ ok: true, verifiedRequestKey: "mock:req:base" }),
  parseWebhookEvent: () => ({ events: [] }),
  initiateCall: async () => ({ providerCallId: "provider-call", status: "initiated" }),
  hangupCall: async () => {},
  playTts: async () => {},
  startListening: async () => {},
  stopListening: async () => {},
  getCallStatus: async () => ({ status: "in-progress", isTerminal: false }),
};

const createConfig = (overrides: Partial<VoiceCallConfig> = {}): VoiceCallConfig => {
  const base = VoiceCallConfigSchema.parse({});
  base.serve.port = 0;

  return {
    ...base,
    ...overrides,
    serve: {
      ...base.serve,
      ...overrides.serve,
    },
  };
};

const createManager = () => {
  const endCall = vi.fn(async () => ({ success: true }));
  const processEvent = vi.fn();
  const manager = {
    getActiveCalls: () => [],
    endCall,
    processEvent,
  } as unknown as CallManager;

  return { manager, endCall, processEvent };
};

function hasPort(value: unknown): value is { port: number | string } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeAddress = value as { port?: unknown };
  return typeof maybeAddress.port === "number" || typeof maybeAddress.port === "string";
}

function requireBoundRequestUrl(server: VoiceCallWebhookServer, baseUrl: string) {
  const address = (
    server as unknown as { server?: { address?: () => unknown } }
  ).server?.address?.();
  if (!hasPort(address) || !address.port) {
    throw new Error("voice webhook server did not expose a bound port");
  }
  const requestUrl = new URL(baseUrl);
  requestUrl.port = String(address.port);
  return requestUrl;
}

async function postWebhookForm(server: VoiceCallWebhookServer, baseUrl: string, body: string) {
  const requestUrl = requireBoundRequestUrl(server, baseUrl);
  return await fetch(requestUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function postWebhookFormWithHeaders(
  server: VoiceCallWebhookServer,
  baseUrl: string,
  body: string,
  headers: Record<string, string>,
) {
  const requestUrl = requireBoundRequestUrl(server, baseUrl);
  return await fetch(requestUrl.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  });
}

async function postWebhookFormWithHeadersResult(
  server: VoiceCallWebhookServer,
  baseUrl: string,
  body: string,
  headers: Record<string, string>,
): Promise<
  | { kind: "response"; statusCode: number; body: string }
  | { kind: "error"; code: string | undefined }
> {
  const requestUrl = requireBoundRequestUrl(server, baseUrl);
  return await new Promise((resolve) => {
    const req = request(
      {
        hostname: requestUrl.hostname,
        port: requestUrl.port,
        path: requestUrl.pathname + requestUrl.search,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          ...headers,
        },
      },
      (res) => {
        res.setEncoding("utf8");
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({
            kind: "response",
            statusCode: res.statusCode ?? 0,
            body: responseBody,
          });
        });
      },
    );
    req.on("error", (error: NodeJS.ErrnoException) => {
      resolve({ kind: "error", code: error.code });
    });
    req.end(body);
  });
}

describe("VoiceCallWebhookServer pre-auth webhook guards", () => {
  it("rejects missing signature headers before reading the request body", async () => {
    const verifyWebhook = vi.fn(() => ({ ok: true, verifiedRequestKey: "twilio:req:test" }));
    const twilioProvider: VoiceCallProvider = {
      ...provider,
      name: "twilio",
      verifyWebhook,
    };
    const { manager } = createManager();
    const config = createConfig({ provider: "twilio" });
    const server = new VoiceCallWebhookServer(config, manager, twilioProvider);
    const readBodySpy = vi.spyOn(
      server as unknown as {
        readBody: (req: unknown, maxBytes: number, timeoutMs?: number) => Promise<string>;
      },
      "readBody",
    );

    try {
      const baseUrl = await server.start();
      const response = await postWebhookForm(server, baseUrl, "CallSid=CA123&SpeechResult=hello");

      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Unauthorized");
      expect(readBodySpy).not.toHaveBeenCalled();
      expect(verifyWebhook).not.toHaveBeenCalled();
    } finally {
      readBodySpy.mockRestore();
      await server.stop();
    }
  });

  it("does not reject unsigned requests when signature verification is disabled", async () => {
    const verifyWebhook = vi.fn(() => ({ ok: true, verifiedRequestKey: "twilio:req:test" }));
    const twilioProvider: VoiceCallProvider = {
      ...provider,
      name: "twilio",
      verifyWebhook,
    };
    const { manager } = createManager();
    const config = createConfig({ provider: "twilio", skipSignatureVerification: true });
    const server = new VoiceCallWebhookServer(config, manager, twilioProvider);

    try {
      const baseUrl = await server.start();
      const response = await postWebhookForm(server, baseUrl, "CallSid=CA123");

      // skipSignatureVerification makes every provider's verifier return ok before it reads
      // a header, so the presence gate must not reject what verification would accept.
      expect(response.status).toBe(200);
      expect(verifyWebhook).toHaveBeenCalled();
    } finally {
      await server.stop();
    }
  });

  it("does not gate providers that require no signature headers", async () => {
    const { manager } = createManager();
    const config = createConfig({ provider: "mock" });
    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      const baseUrl = await server.start();
      const response = await postWebhookForm(server, baseUrl, "CallSid=CA123");

      expect(response.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("uses the shared pre-auth body cap before verification", async () => {
    const verifyWebhook = vi.fn(() => ({ ok: true, verifiedRequestKey: "twilio:req:test" }));
    const twilioProvider: VoiceCallProvider = {
      ...provider,
      name: "twilio",
      verifyWebhook,
    };
    const { manager } = createManager();
    const config = createConfig({ provider: "twilio" });
    const server = new VoiceCallWebhookServer(config, manager, twilioProvider);

    try {
      const baseUrl = await server.start();
      const responseOrError = await postWebhookFormWithHeadersResult(
        server,
        baseUrl,
        "CallSid=CA123&SpeechResult=".padEnd(70 * 1024, "a"),
        { "x-twilio-signature": "sig" },
      );

      if (responseOrError.kind === "response") {
        expect(responseOrError.statusCode).toBe(413);
        expect(responseOrError.body).toBe("Payload Too Large");
      } else {
        expect(responseOrError.code).toBeOneOf(["ECONNRESET", "EPIPE"]);
      }
      expect(verifyWebhook).not.toHaveBeenCalled();
    } finally {
      await server.stop();
    }
  });

  it("limits concurrent pre-auth requests per source IP", async () => {
    const twilioProvider: VoiceCallProvider = {
      ...provider,
      name: "twilio",
      verifyWebhook: () => ({ ok: true, verifiedRequestKey: "twilio:req:test" }),
    };
    const { manager } = createManager();
    const config = createConfig({ provider: "twilio" });
    const server = new VoiceCallWebhookServer(config, manager, twilioProvider);

    let enteredReads = 0;
    let releaseReads!: () => void;
    let unblockReadBodies!: () => void;
    const enteredEightReads = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const unblockReads = new Promise<void>((resolve) => {
      unblockReadBodies = resolve;
    });
    const readBodySpy = vi.spyOn(
      server as unknown as {
        readBody: (req: unknown, maxBytes: number, timeoutMs?: number) => Promise<string>;
      },
      "readBody",
    );
    readBodySpy.mockImplementation(async () => {
      enteredReads += 1;
      if (enteredReads === 8) {
        releaseReads();
      }
      await unblockReads;
      return "CallSid=CA123&SpeechResult=hello";
    });

    try {
      const baseUrl = await server.start();
      const headers = { "x-twilio-signature": "sig" };
      const inFlightRequests = Array.from({ length: 8 }, () =>
        postWebhookFormWithHeaders(server, baseUrl, "CallSid=CA123", headers),
      );
      await enteredEightReads;

      const rejected = await postWebhookFormWithHeaders(server, baseUrl, "CallSid=CA999", headers);
      expect(rejected.status).toBe(429);
      expect(await rejected.text()).toBe("Too Many Requests");

      unblockReadBodies();

      const settled = await Promise.all(inFlightRequests);
      expect(settled.every((response) => response.status === 200)).toBe(true);
    } finally {
      unblockReadBodies();
      readBodySpy.mockRestore();
      await server.stop();
    }
  });
});
