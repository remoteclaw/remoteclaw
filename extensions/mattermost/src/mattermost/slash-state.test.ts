import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import {
  type RemoteClawPluginApi,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
} from "remoteclaw/plugin-sdk/mattermost";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMattermostRuntime } from "../runtime.js";
import type { ResolvedMattermostAccount } from "./accounts.js";
import type { MattermostRegisteredCommand } from "./slash-commands.js";
import {
  activateSlashCommands,
  deactivateSlashCommands,
  registerSlashCommandRoute,
  resolveSlashHandlerForToken,
} from "./slash-state.js";

const clientMocks = vi.hoisted(() => ({
  fetchMattermostChannel: vi.fn(),
}));

// Mock only the network-touching channel lookup; keep the rest of client.js real
// (createMattermostClient just builds an object — no network at construction).
vi.mock("./client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client.js")>();
  return {
    ...actual,
    fetchMattermostChannel: clientMocks.fetchMattermostChannel,
  };
});

function registered(
  token: string,
  overrides: Partial<MattermostRegisteredCommand> = {},
): MattermostRegisteredCommand {
  return {
    id: `cmd-${token}`,
    trigger: "oc_status",
    teamId: "t1",
    token,
    url: "https://chat.example.com/callback",
    managed: true,
    ...overrides,
  };
}

describe("slash-state token routing", () => {
  it("returns single match when token belongs to one account", () => {
    deactivateSlashCommands();
    activateSlashCommands({
      account: { accountId: "a1" } as any,
      registeredCommands: [registered("tok-a")],
      api: { cfg: {} as any, runtime: {} as any },
    });

    const match = resolveSlashHandlerForToken("tok-a");
    expect(match.kind).toBe("single");
    expect(match.accountIds).toEqual(["a1"]);
  });

  it("returns ambiguous when same token exists in multiple accounts", () => {
    deactivateSlashCommands();
    activateSlashCommands({
      account: { accountId: "a1" } as any,
      registeredCommands: [registered("tok-shared", { id: "c1", teamId: "t1" })],
      api: { cfg: {} as any, runtime: {} as any },
    });
    activateSlashCommands({
      account: { accountId: "a2" } as any,
      registeredCommands: [registered("tok-shared", { id: "c2", teamId: "t2" })],
      api: { cfg: {} as any, runtime: {} as any },
    });

    const match = resolveSlashHandlerForToken("tok-shared");
    expect(match.kind).toBe("ambiguous");
    expect(match.accountIds?.toSorted()).toEqual(["a1", "a2"]);
  });
});

// ── Per-source endpoint rate limiting on the slash callback route ─────────────

const RATE_LIMIT = WEBHOOK_RATE_LIMIT_DEFAULTS.maxRequests;
const CALLBACK_PATH = "/mm/slash";

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

/**
 * Build a minimal plugin API that captures the handler(s) registered by
 * registerSlashCommandRoute so a test can drive them directly (no HTTP server —
 * mirrors how slash-http.test.ts exercises the per-account handler).
 */
function createRouteApi(overrides?: { gateway?: unknown }): {
  api: RemoteClawPluginApi;
  getHandler: (path?: string) => RouteHandler;
} {
  const handlers = new Map<string, RouteHandler>();
  const api = {
    id: "mattermost",
    name: "mattermost",
    source: "test",
    config: {
      channels: { mattermost: { commands: { callbackPath: CALLBACK_PATH } } },
      gateway: overrides?.gateway,
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    registerHttpRoute: (params: { path: string; handler: RouteHandler }) => {
      handlers.set(params.path, params.handler);
    },
  } as unknown as RemoteClawPluginApi;
  return {
    api,
    getHandler: (path = CALLBACK_PATH) => {
      const handler = handlers.get(path);
      if (!handler) {
        throw new Error(`no handler registered for ${path}`);
      }
      return handler;
    },
  };
}

function createReq(params: {
  method?: string;
  body?: string;
  contentType?: string;
  remoteAddress?: string;
}): IncomingMessage {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = params.method ?? "POST";
  req.url = CALLBACK_PATH;
  req.headers = {
    "content-type": params.contentType ?? "application/x-www-form-urlencoded",
  };
  (req as unknown as { socket: { remoteAddress?: string } }).socket = {
    remoteAddress: params.remoteAddress ?? "10.0.0.1",
  };
  process.nextTick(() => {
    if (params.body) {
      stream.write(params.body);
    }
    stream.end();
  });
  return req;
}

function createRes(): {
  res: ServerResponse;
  status: () => number;
  body: () => string;
  headers: Map<string, string>;
} {
  const headers = new Map<string, string>();
  let body = "";
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk?: string | Buffer) {
      body = chunk != null ? String(chunk) : "";
    },
  } as unknown as ServerResponse;
  return { res, status: () => res.statusCode, body: () => body, headers };
}

function slashBody(token: string): string {
  return new URLSearchParams({
    token,
    team_id: "t1",
    channel_id: "c1",
    user_id: "u1",
    command: "/oc_status",
    text: "",
  }).toString();
}

function activate(accountId: string, tokens: string[]): void {
  activateSlashCommands({
    account: {
      accountId,
      baseUrl: "https://chat.example.com",
      botToken: "bot-token",
    } as unknown as ResolvedMattermostAccount,
    registeredCommands: tokens.map((token, index) =>
      registered(token, { id: `${accountId}-${index}` }),
    ),
    api: { cfg: {} as any, runtime: {} as any },
  });
}

describe("slash callback rate limiting", () => {
  beforeEach(() => {
    deactivateSlashCommands();
    clientMocks.fetchMattermostChannel.mockReset();
    clientMocks.fetchMattermostChannel.mockResolvedValue(null);
    // A non-throwing runtime is enough: with fetchMattermostChannel → null the
    // authorization flow returns before it dereferences the runtime.
    setMattermostRuntime({} as never);
  });

  afterEach(() => {
    deactivateSlashCommands();
  });

  it("(a) bounds a pre-auth flood from one source with 429, not 401", async () => {
    activate("a1", ["known-token"]);
    const { api, getHandler } = createRouteApi();
    registerSlashCommandRoute(api);
    const handler = getHandler();

    let saw401 = false;
    let saw429 = false;
    for (let i = 0; i < RATE_LIMIT + 10; i += 1) {
      const res = createRes();
      await handler(createReq({ body: slashBody(`bad-${i}`), remoteAddress: "10.0.0.1" }), res.res);
      if (res.status() === 429) {
        saw429 = true;
        expect(res.body()).toBe("Too Many Requests");
        break;
      }
      // Under the limit an invalid token is rejected by auth (401) — proving the
      // 429 above is the rate gate firing *before* auth, not the auth path.
      expect(res.status()).toBe(401);
      saw401 = true;
    }

    expect(saw401).toBe(true);
    expect(saw429).toBe(true);
  });

  it("(b) keys the budget by source, not by token", async () => {
    const { api, getHandler } = createRouteApi();
    registerSlashCommandRoute(api);
    const handler = getHandler();

    // Exhaust source A's budget using a different garbage token every request.
    let exhausted = false;
    for (let i = 0; i < RATE_LIMIT + 5; i += 1) {
      const res = createRes();
      await handler(
        createReq({ body: slashBody(`tokenA-${i}`), remoteAddress: "10.0.0.1" }),
        res.res,
      );
      if (res.status() === 429) {
        exhausted = true;
        break;
      }
    }
    expect(exhausted).toBe(true);

    // A brand-new token from the SAME source is still limited (token-agnostic key).
    const sameSource = createRes();
    await handler(
      createReq({ body: slashBody("a-different-token"), remoteAddress: "10.0.0.1" }),
      sameSource.res,
    );
    expect(sameSource.status()).toBe(429);

    // A DIFFERENT source has an independent budget.
    const otherSource = createRes();
    await handler(
      createReq({ body: slashBody("whatever"), remoteAddress: "10.9.9.9" }),
      otherSource.res,
    );
    expect(otherSource.status()).not.toBe(429);
  });

  it("(c) returns a neutral 429 that is byte-identical for valid and invalid tokens", async () => {
    activate("a1", ["valid-token"]);
    const { api, getHandler } = createRouteApi();
    registerSlashCommandRoute(api);
    const handler = getHandler();

    for (let i = 0; i < RATE_LIMIT + 1; i += 1) {
      const res = createRes();
      await handler(createReq({ body: slashBody(`bad-${i}`), remoteAddress: "10.0.0.1" }), res.res);
    }

    const validRes = createRes();
    await handler(
      createReq({ body: slashBody("valid-token"), remoteAddress: "10.0.0.1" }),
      validRes.res,
    );
    const invalidRes = createRes();
    await handler(
      createReq({ body: slashBody("nope"), remoteAddress: "10.0.0.1" }),
      invalidRes.res,
    );

    expect(validRes.status()).toBe(429);
    expect(invalidRes.status()).toBe(429);
    expect(validRes.body()).toBe("Too Many Requests");
    expect(validRes.body()).toBe(invalidRes.body());
    // The rate gate precedes auth, so the valid token never reached the API.
    expect(clientMocks.fetchMattermostChannel).not.toHaveBeenCalled();
  });

  it("(d) spends no rate budget on non-POST requests (method pre-gate)", async () => {
    const { api, getHandler } = createRouteApi();
    registerSlashCommandRoute(api);
    const handler = getHandler();

    for (let i = 0; i < 20; i += 1) {
      const res = createRes();
      await handler(createReq({ method: "GET", remoteAddress: "10.0.0.1" }), res.res);
      expect(res.status()).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }

    // A full burst of exactly maxRequests POSTs from the same source still all
    // pass the rate gate — impossible if the 20 GETs had consumed any budget.
    let saw429 = false;
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      const res = createRes();
      await handler(createReq({ body: slashBody(`x-${i}`), remoteAddress: "10.0.0.1" }), res.res);
      if (res.status() === 429) {
        saw429 = true;
      }
    }
    expect(saw429).toBe(false);
  });

  it("(e) increments the source budget exactly once per multi-account replay", async () => {
    activate("a1", ["token-a"]);
    activate("a2", ["token-b"]); // ≥2 accounts → the buffer/replay path is used
    const { api, getHandler } = createRouteApi();
    registerSlashCommandRoute(api);
    const handler = getHandler();

    // maxRequests valid requests (token matches account B) from ONE source. If
    // the buffer/replay double-counted, a 429 would appear before request #max.
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      const res = createRes();
      await handler(createReq({ body: slashBody("token-b"), remoteAddress: "10.0.0.1" }), res.res);
      expect(res.status()).not.toBe(429);
    }
    // The (maxRequests + 1)-th request is the first to exceed the budget → 429.
    const overflow = createRes();
    await handler(
      createReq({ body: slashBody("token-b"), remoteAddress: "10.0.0.1" }),
      overflow.res,
    );
    expect(overflow.status()).toBe(429);

    // The replay actually reached account B's handler on the routed requests.
    expect(clientMocks.fetchMattermostChannel).toHaveBeenCalled();
  });

  it("(f) does not drop legitimate volume at or below the limit", async () => {
    const { api, getHandler } = createRouteApi();
    registerSlashCommandRoute(api);
    const handler = getHandler();

    for (let i = 0; i < RATE_LIMIT; i += 1) {
      const res = createRes();
      await handler(createReq({ body: slashBody(`ok-${i}`), remoteAddress: "10.0.0.1" }), res.res);
      expect(res.status()).not.toBe(429);
    }
  });

  it("(g) preserves Layer-1: invalid token → 401 with no API call; valid token routes", async () => {
    activate("a1", ["valid-token"]);
    const { api, getHandler } = createRouteApi();
    registerSlashCommandRoute(api);
    const handler = getHandler();

    // Invalid token, under the limit → 401 with no Mattermost channel lookup.
    const invalid = createRes();
    await handler(
      createReq({ body: slashBody("wrong-token"), remoteAddress: "10.0.0.1" }),
      invalid.res,
    );
    expect(invalid.status()).toBe(401);
    expect(clientMocks.fetchMattermostChannel).not.toHaveBeenCalled();

    // Valid token → routes past the token gate into the authorization flow
    // (reaches the channel lookup). It is neither auth-rejected nor rate-limited.
    const valid = createRes();
    await handler(
      createReq({ body: slashBody("valid-token"), remoteAddress: "10.0.0.1" }),
      valid.res,
    );
    expect(valid.status()).not.toBe(401);
    expect(valid.status()).not.toBe(429);
    expect(clientMocks.fetchMattermostChannel).toHaveBeenCalledTimes(1);
  });
});
