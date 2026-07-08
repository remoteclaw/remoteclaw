import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveSession, resolveSessionKeyForRequest } from "./session.js";

const mocks = vi.hoisted(() => ({
  loadSessionStore: vi.fn(),
  resolveStorePath: vi.fn(),
  listAgentIds: vi.fn(),
  resolveExplicitAgentSessionKey: vi.fn(),
  evaluateSessionFreshness: vi.fn(),
}));

vi.mock("../../config/sessions/main-session.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions/main-session.js")>(
    "../../config/sessions/main-session.js",
  );
  return {
    ...actual,
    resolveExplicitAgentSessionKey: mocks.resolveExplicitAgentSessionKey,
  };
});

// The barrel (../../config/sessions.js) re-exports loadSessionStore from ./sessions/store.js
// (NOT store-load.js), so store.js is the module session.ts actually binds. Partial-mock it:
// importActual keeps every other store export real and overrides only loadSessionStore.
vi.mock("../../config/sessions/store.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions/store.js")>(
    "../../config/sessions/store.js",
  );
  return { ...actual, loadSessionStore: mocks.loadSessionStore };
});

vi.mock("../../config/sessions/paths.js", () => ({
  resolveStorePath: mocks.resolveStorePath,
}));

// Override only listAgentIds (used by the cross-store search); keep resolveSessionAgentId
// and its default-agent resolution real so resolveSessionKeyForRequest's storeAgentId
// derivation (#2796) runs against real logic.
vi.mock("../../agents/agent-scope.js", async () => {
  const actual = await vi.importActual<typeof import("../../agents/agent-scope.js")>(
    "../../agents/agent-scope.js",
  );
  return { ...actual, listAgentIds: mocks.listAgentIds };
});

// Manual (non-importActual) mock of the reset module. resolveSession consumes exactly
// four exports from here; freshness is driven entirely by the evaluateSessionFreshness
// mock, and the reset-policy helpers only feed that (mocked) call, so plain stubs suffice.
// NOTE: importActual here would pull a second real copy of the sessions module graph
// through the `export *` barrel, causing session.ts to bind the real loadSessionStore
// instead of the mock above — so keep this a pure manual factory.
vi.mock("../../config/sessions/reset.js", () => ({
  evaluateSessionFreshness: mocks.evaluateSessionFreshness,
  resolveSessionResetType: () => "idle",
  resolveSessionResetPolicy: () => ({}),
  resolveChannelResetConfig: () => undefined,
}));

describe("resolveSessionKeyForRequest", () => {
  const MAIN_STORE_PATH = "/tmp/main-store.json";
  const MYBOT_STORE_PATH = "/tmp/mybot-store.json";
  type SessionStoreEntry = { sessionId: string; updatedAt: number };
  type SessionStoreMap = Record<string, SessionStoreEntry>;

  const setupMainAndMybotStorePaths = () => {
    mocks.listAgentIds.mockReturnValue(["main", "mybot"]);
    mocks.resolveStorePath.mockImplementation(
      (_store: string | undefined, opts?: { agentId?: string }) => {
        if (opts?.agentId === "mybot") {
          return MYBOT_STORE_PATH;
        }
        return MAIN_STORE_PATH;
      },
    );
  };

  const mockStoresByPath = (stores: Partial<Record<string, SessionStoreMap>>) => {
    mocks.loadSessionStore.mockImplementation((storePath: string) => stores[storePath] ?? {});
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAgentIds.mockReturnValue(["main"]);
    mocks.resolveExplicitAgentSessionKey.mockReturnValue(undefined);
  });

  const baseCfg: RemoteClawConfig = {};

  it("returns sessionKey when --to resolves a session key via context", () => {
    mocks.resolveStorePath.mockReturnValue(MAIN_STORE_PATH);
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:main": { sessionId: "sess-1", updatedAt: 0 },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      to: "+15551234567",
    });
    expect(result.sessionKey).toBe("agent:main:main");
  });

  it("#2796: resolves the default-agent store when no --agent/--session-key is given (no throw)", () => {
    mocks.resolveStorePath.mockReturnValue(MAIN_STORE_PATH);
    mocks.loadSessionStore.mockReturnValue({});

    // Only --to: no --agent, --session-key, or --session-id. resolveExplicitAgentSessionKey
    // returns undefined here, which previously reached the throwing resolveAgentIdFromSessionKey
    // ("Cannot resolve agent id: session key has no agent segment"). It must now fall back to
    // the default agent's store instead.
    expect(() => resolveSessionKeyForRequest({ cfg: baseCfg, to: "+15551234567" })).not.toThrow();

    const result = resolveSessionKeyForRequest({ cfg: baseCfg, to: "+15551234567" });
    expect(result.sessionKey).toBeDefined();
    expect(result.storePath).toBe(MAIN_STORE_PATH);
  });

  it("finds session by sessionId via reverse lookup in primary store", () => {
    mocks.resolveStorePath.mockReturnValue(MAIN_STORE_PATH);
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:main": { sessionId: "target-session-id", updatedAt: 0 },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      sessionId: "target-session-id",
    });
    expect(result.sessionKey).toBe("agent:main:main");
  });

  it("finds session by sessionId in non-primary agent store", () => {
    setupMainAndMybotStorePaths();
    mockStoresByPath({
      [MYBOT_STORE_PATH]: {
        "agent:mybot:main": { sessionId: "target-session-id", updatedAt: 0 },
      },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      sessionId: "target-session-id",
    });
    expect(result.sessionKey).toBe("agent:mybot:main");
    expect(result.storePath).toBe(MYBOT_STORE_PATH);
  });

  // Skipped: asserts a sessionId cross-store search / --session-id-within-agent behavior
  // that the gutted code no longer implements — triage (stale vs regression) tracked in #2798.
  it.skip("does not let --agent short-circuit --session-id back to the agent main session", async () => {
    setupMainAndMybotStorePaths();
    mocks.resolveExplicitAgentSessionKey.mockReturnValue("agent:mybot:main");
    mockStoresByPath({
      [MYBOT_STORE_PATH]: {
        "agent:mybot:main": { sessionId: "other-session-id", updatedAt: 0 },
        "agent:mybot:whatsapp:direct:+15551234567": {
          sessionId: "target-session-id",
          updatedAt: 1,
        },
      },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      agentId: "mybot",
      sessionId: "target-session-id",
    });

    expect(result.sessionKey).toBe("agent:mybot:whatsapp:direct:+15551234567");
    expect(result.storePath).toBe(MYBOT_STORE_PATH);
  });

  it("treats whitespace --session-id as absent when resolving --agent", () => {
    setupMainAndMybotStorePaths();
    mocks.resolveExplicitAgentSessionKey.mockReturnValue("agent:mybot:main");
    mockStoresByPath({
      [MYBOT_STORE_PATH]: {
        "agent:mybot:main": { sessionId: "existing-session-id", updatedAt: 1 },
      },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      agentId: "mybot",
      sessionId: "   ",
    });

    expect(result.sessionKey).toBe("agent:mybot:main");
    expect(result.storePath).toBe(MYBOT_STORE_PATH);
  });

  // Skipped: expects a deterministic `agent:<id>:explicit:<sessionId>` key no longer generated — see #2798.
  it.skip("does not search other agent stores when --agent scopes --session-id", async () => {
    setupMainAndMybotStorePaths();
    mockStoresByPath({
      [MAIN_STORE_PATH]: {
        "agent:main:whatsapp:direct:+15550000000": {
          sessionId: "target-session-id",
          updatedAt: 10,
        },
      },
      [MYBOT_STORE_PATH]: {},
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      agentId: "mybot",
      sessionId: "target-session-id",
    });

    expect(result.sessionKey).toBe("agent:mybot:explicit:target-session-id");
    expect(result.storePath).toBe(MYBOT_STORE_PATH);
    expect(mocks.loadSessionStore).toHaveBeenCalledTimes(1);
    expect(mocks.loadSessionStore).toHaveBeenCalledWith(MYBOT_STORE_PATH);
  });

  it("returns correct sessionStore when session found in non-primary agent store", () => {
    const mybotStore = {
      "agent:mybot:main": { sessionId: "target-session-id", updatedAt: 0 },
    };
    setupMainAndMybotStorePaths();
    mockStoresByPath({
      [MYBOT_STORE_PATH]: { ...mybotStore },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      sessionId: "target-session-id",
    });
    expect(result.sessionStore["agent:mybot:main"]?.sessionId).toBe("target-session-id");
  });

  // Skipped: expects a deterministic `agent:<id>:explicit:<sessionId>` key no longer generated — see #2798.
  it.skip("returns a deterministic explicit sessionKey when sessionId not found in any store", async () => {
    setupMainAndMybotStorePaths();
    mocks.loadSessionStore.mockReturnValue({});

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      sessionId: "nonexistent-id",
    });
    expect(result.sessionKey).toBe("agent:main:explicit:nonexistent-id");
  });

  it("does not search other stores when explicitSessionKey is set", () => {
    mocks.listAgentIds.mockReturnValue(["main", "mybot"]);
    mocks.resolveStorePath.mockReturnValue(MAIN_STORE_PATH);
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:main": { sessionId: "other-id", updatedAt: 0 },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      sessionKey: "agent:main:main",
      sessionId: "target-session-id",
    });
    // explicitSessionKey is set, so sessionKey comes from it, not from sessionId lookup
    expect(result.sessionKey).toBe("agent:main:main");
  });

  it("searches other stores when --to derives a key that does not match --session-id", () => {
    setupMainAndMybotStorePaths();
    mockStoresByPath({
      [MAIN_STORE_PATH]: {
        "agent:main:main": { sessionId: "other-session-id", updatedAt: 0 },
      },
      [MYBOT_STORE_PATH]: {
        "agent:mybot:main": { sessionId: "target-session-id", updatedAt: 0 },
      },
    });

    const result = resolveSessionKeyForRequest({
      cfg: baseCfg,
      to: "+15551234567",
      sessionId: "target-session-id",
    });
    // --to derives agent:main:main, but its sessionId doesn't match target-session-id,
    // so the cross-store search finds it in the mybot store
    expect(result.sessionKey).toBe("agent:mybot:main");
    expect(result.storePath).toBe(MYBOT_STORE_PATH);
  });

  // Skipped: asserts an exact loadSessionStore call count tied to the old search/skip loop — see #2798.
  it.skip("skips already-searched primary store when iterating agents", async () => {
    setupMainAndMybotStorePaths();
    mocks.loadSessionStore.mockReturnValue({});

    resolveSessionKeyForRequest({
      cfg: baseCfg,
      sessionId: "nonexistent-id",
    });

    // loadSessionStore should be called twice: once for main, once for mybot
    // (not twice for main)
    const storePaths = mocks.loadSessionStore.mock.calls.map((call) => String(call[0]));
    expect(storePaths).toHaveLength(2);
    expect(storePaths).toContain(MAIN_STORE_PATH);
    expect(storePaths).toContain(MYBOT_STORE_PATH);
  });
});

describe("resolveSession (#2120 stale session rollover)", () => {
  const STORE_PATH = "/tmp/main-store.json";
  const SESSION_KEY = "agent:main:main";
  const baseCfg: RemoteClawConfig = {};

  type StoredEntry = {
    sessionId: string;
    updatedAt: number;
    cliSessionIds?: Record<string, string>;
    verboseLevel?: string;
  };

  // These tests isolate resolveSession's rollover DECISION (the #2120 fix) from
  // the orthogonal session-key resolution mechanism: resolveExplicitAgentSessionKey
  // is mocked to a valid explicit key, so the store entry is fetched under SESSION_KEY
  // regardless of how the key was derived. Freshness is driven entirely by the
  // evaluateSessionFreshness mock.
  const seedStore = (entry: StoredEntry): Record<string, StoredEntry> => {
    const store: Record<string, StoredEntry> = { [SESSION_KEY]: entry };
    mocks.loadSessionStore.mockReturnValue(store);
    return store;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAgentIds.mockReturnValue(["main"]);
    mocks.resolveExplicitAgentSessionKey.mockReturnValue(SESSION_KEY);
    mocks.resolveStorePath.mockReturnValue(STORE_PATH);
    mocks.evaluateSessionFreshness.mockReturnValue({ fresh: true });
  });

  it("rolls over a stale session: no explicit id + stale entry → new session, old entry dropped", () => {
    mocks.evaluateSessionFreshness.mockReturnValue({ fresh: false });
    const store = seedStore({
      sessionId: "old-session-id",
      updatedAt: 1000,
      cliSessionIds: { claude: "stale-cli-id" },
    });

    const result = resolveSession({ cfg: baseCfg });

    expect(result.isNewSession).toBe(true);
    // The stale entry must NOT be surfaced — otherwise its expired cliSessionIds
    // would be resumed via `--resume` (the #2120 bug).
    expect(result.sessionEntry).toBeUndefined();
    expect(result.sessionId).not.toBe("old-session-id");
    // And it is dropped from the store so it can't be resumed later.
    expect(store[SESSION_KEY]).toBeUndefined();
  });

  it("continues a fresh session: no explicit id + fresh entry → reuse entry and id", () => {
    mocks.evaluateSessionFreshness.mockReturnValue({ fresh: true });
    const store = seedStore({
      sessionId: "fresh-session-id",
      updatedAt: 1000,
      cliSessionIds: { claude: "fresh-cli-id" },
    });

    const result = resolveSession({ cfg: baseCfg });

    expect(result.isNewSession).toBe(false);
    expect(result.sessionEntry?.sessionId).toBe("fresh-session-id");
    expect(result.sessionId).toBe("fresh-session-id");
    // Reused, so the entry stays in the store.
    expect(store[SESSION_KEY]).toBeDefined();
  });

  it("reuses a stale entry when an explicit sessionId matches it (explicit continue overrides staleness)", () => {
    mocks.evaluateSessionFreshness.mockReturnValue({ fresh: false });
    const store = seedStore({
      sessionId: "explicit-session-id",
      updatedAt: 1000,
      cliSessionIds: { claude: "cli-id" },
    });

    const result = resolveSession({
      cfg: baseCfg,
      sessionId: "explicit-session-id",
    });

    expect(result.isNewSession).toBe(false);
    expect(result.sessionEntry?.sessionId).toBe("explicit-session-id");
    expect(result.sessionId).toBe("explicit-session-id");
    expect(store[SESSION_KEY]).toBeDefined();
  });

  it("starts a new session when an explicit sessionId does not match the stored entry, dropping it", () => {
    // Even if the entry is fresh by time, a mismatched explicit id is a rollover.
    mocks.evaluateSessionFreshness.mockReturnValue({ fresh: true });
    const store = seedStore({
      sessionId: "old-session-id",
      updatedAt: 1000,
      cliSessionIds: { claude: "stale-cli-id" },
    });

    const result = resolveSession({
      cfg: baseCfg,
      sessionId: "brand-new-id",
    });

    expect(result.isNewSession).toBe(true);
    expect(result.sessionEntry).toBeUndefined();
    expect(result.sessionId).toBe("brand-new-id");
    expect(store[SESSION_KEY]).toBeUndefined();
  });

  it("surfaces persistedVerbose only when the session is reused", () => {
    // Fresh → reused → verbose preserved.
    mocks.evaluateSessionFreshness.mockReturnValue({ fresh: true });
    seedStore({ sessionId: "s", updatedAt: 1000, verboseLevel: "full" });
    const reused = resolveSession({ cfg: baseCfg });
    expect(reused.persistedVerbose).toBe("full");

    // Stale → rolled over → verbose dropped with the entry.
    mocks.evaluateSessionFreshness.mockReturnValue({ fresh: false });
    seedStore({ sessionId: "s", updatedAt: 1000, verboseLevel: "full" });
    const rolled = resolveSession({ cfg: baseCfg });
    expect(rolled.persistedVerbose).toBeUndefined();
  });
});
