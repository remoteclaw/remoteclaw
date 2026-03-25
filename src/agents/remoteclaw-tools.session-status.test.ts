import { describe, expect, it, vi } from "vitest";

const loadSessionStoreMock = vi.fn();
const updateSessionStoreMock = vi.fn();

vi.mock("../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions.js")>();
  return {
    ...actual,
    loadSessionStore: (storePath: string) => loadSessionStoreMock(storePath),
    updateSessionStore: async (
      storePath: string,
      mutator: (store: Record<string, unknown>) => Promise<void> | void,
    ) => {
      const store = loadSessionStoreMock(storePath) as Record<string, unknown>;
      await mutator(store);
      updateSessionStoreMock(storePath, store);
      return store;
    },
    resolveStorePath: (_store: string | undefined, opts?: { agentId?: string }) =>
      opts?.agentId === "support" ? "/tmp/support/sessions.json" : "/tmp/main/sessions.json",
  };
});

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => ({
      session: { mainKey: "main", scope: "per-sender" },
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-opus-4-5" },
          models: {},
        },
      },
    }),
  };
});

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: async () => [
    {
      provider: "anthropic",
      id: "claude-opus-4-5",
      name: "Opus",
      contextWindow: 200000,
    },
    {
      provider: "anthropic",
      id: "claude-sonnet-4-5",
      name: "Sonnet",
      contextWindow: 200000,
    },
  ],
}));

vi.mock("../auth/index.js", () => ({
  ensureAuthProfileStore: () => ({ profiles: {} }),
  listProfilesForProvider: () => [],
  resolveAuthProfileDisplayLabel: () => undefined,
}));

vi.mock("../agents/model-auth.js", () => ({
  resolveEnvApiKey: () => null,
  resolveUsableCustomProviderApiKey: () => null,
  resolveModelAuthMode: () => "api-key",
}));

vi.mock("../infra/provider-usage.js", () => ({
  resolveUsageProviderId: () => undefined,
  loadProviderUsageSummary: async () => ({
    updatedAt: Date.now(),
    providers: [],
  }),
  formatUsageSummaryLine: () => null,
}));

const callGatewayMock = vi.fn(async () => ({}));
vi.mock("../gateway/call.js", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

const loadCombinedSessionStoreForGatewayMock = vi.fn(() => ({
  storePath: "(multiple)",
  store: {},
}));
vi.mock("../gateway/session-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gateway/session-utils.js")>();
  return {
    ...actual,
    loadCombinedSessionStoreForGateway: (...args: unknown[]) =>
      loadCombinedSessionStoreForGatewayMock(...args),
  };
});

import "./test-helpers/fast-core-tools.js";
import { createRemoteClawTools } from "./remoteclaw-tools.js";

function resetSessionStore(store: Record<string, unknown>) {
  loadSessionStoreMock.mockClear();
  updateSessionStoreMock.mockClear();
  loadSessionStoreMock.mockReturnValue(store);
}

function getSessionStatusTool(agentSessionKey = "main") {
  const tool = createRemoteClawTools({ agentSessionKey }).find(
    (candidate) => candidate.name === "session_status",
  );
  expect(tool).toBeDefined();
  if (!tool) {
    throw new Error("missing session_status tool");
  }
  return tool;
}

describe("session_status tool", () => {
  it("returns a status card for the current session", async () => {
    resetSessionStore({
      main: {
        sessionId: "s1",
        updatedAt: 10,
      },
    });

    const tool = getSessionStatusTool();

    const result = await tool.execute("call1", {});
    const details = result.details as { ok?: boolean; statusText?: string };
    expect(details.ok).toBe(true);
    expect(details.statusText).toContain("RemoteClaw");
    expect(details.statusText).toContain("🧠 Model:");
    expect(details.statusText).not.toContain("OAuth/token status");
  });

  it("errors for unknown session keys", async () => {
    resetSessionStore({
      main: { sessionId: "s1", updatedAt: 10 },
    });

    const tool = getSessionStatusTool();

    await expect(tool.execute("call2", { sessionKey: "nope" })).rejects.toThrow(
      "Unknown sessionId",
    );
    expect(updateSessionStoreMock).not.toHaveBeenCalled();
  });

  it("resolves sessionKey=current to the requester session", async () => {
    resetSessionStore({
      main: {
        sessionId: "s1",
        updatedAt: 10,
      },
    });

    const tool = getSessionStatusTool();

    const result = await tool.execute("call-current", { sessionKey: "current" });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("main");
  });

  it("resolves sessionKey=current to the requester agent session", async () => {
    loadSessionStoreMock.mockClear();
    updateSessionStoreMock.mockClear();
    callGatewayMock.mockClear();
    loadCombinedSessionStoreForGatewayMock.mockClear();
    const stores = new Map<string, Record<string, unknown>>([
      [
        "/tmp/main/sessions.json",
        {
          "agent:main:main": { sessionId: "s-main", updatedAt: 10 },
        },
      ],
      [
        "/tmp/support/sessions.json",
        {
          main: { sessionId: "s-support", updatedAt: 20 },
        },
      ],
    ]);
    loadSessionStoreMock.mockImplementation((storePath: string) => {
      return stores.get(storePath) ?? {};
    });
    loadCombinedSessionStoreForGatewayMock.mockReturnValue({
      storePath: "(multiple)",
      store: Object.fromEntries([...stores.values()].flatMap((s) => Object.entries(s))),
    });

    const tool = getSessionStatusTool("agent:support:main");

    // "current" resolves to the support agent's own session via the "main" alias.
    const result = await tool.execute("call-current-child", { sessionKey: "current" });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("main");
  });

  it("prefers a literal current session key in session_status", async () => {
    resetSessionStore({
      main: {
        sessionId: "s-main",
        updatedAt: 10,
      },
      "agent:main:current": {
        sessionId: "s-current",
        updatedAt: 20,
      },
    });

    const tool = getSessionStatusTool();

    const result = await tool.execute("call-current-literal-key", { sessionKey: "current" });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("agent:main:current");
  });

  it("resolves a literal current sessionId in session_status", async () => {
    resetSessionStore({
      main: {
        sessionId: "s-main",
        updatedAt: 10,
      },
      "agent:main:other": {
        sessionId: "current",
        updatedAt: 20,
      },
    });

    const tool = getSessionStatusTool();

    const result = await tool.execute("call-current-literal-id", { sessionKey: "current" });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("agent:main:other");
  });

  it("keeps sessionKey=current bound to the requester subagent session", async () => {
    resetSessionStore({
      "agent:main:main": {
        sessionId: "s-parent",
        updatedAt: 10,
      },
      "agent:main:subagent:child": {
        sessionId: "s-child",
        updatedAt: 20,
        providerOverride: "anthropic",
        modelOverride: "claude-opus-4-5",
      },
    });

    const tool = getSessionStatusTool("agent:main:subagent:child");

    const result = await tool.execute("call-current-subagent", {
      sessionKey: "current",
      model: "anthropic/claude-sonnet-4-5",
    });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("agent:main:subagent:child");
    expect(updateSessionStoreMock).toHaveBeenCalledWith(
      "/tmp/main/sessions.json",
      expect.objectContaining({
        "agent:main:subagent:child": expect.objectContaining({
          modelOverride: "claude-sonnet-4-5",
        }),
      }),
    );
  });

  it("resolves sessionId inputs", async () => {
    const sessionId = "sess-main";
    resetSessionStore({
      "agent:main:main": {
        sessionId,
        updatedAt: 10,
      },
    });

    const tool = getSessionStatusTool();

    const result = await tool.execute("call3", { sessionKey: sessionId });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("agent:main:main");
  });

  it("uses non-standard session keys without sessionId resolution", async () => {
    resetSessionStore({
      "temp:slug-generator": {
        sessionId: "sess-temp",
        updatedAt: 10,
      },
    });

    const tool = getSessionStatusTool();

    const result = await tool.execute("call4", { sessionKey: "temp:slug-generator" });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("temp:slug-generator");
  });

  it("blocks cross-agent session_status without agent-to-agent access", async () => {
    resetSessionStore({
      "agent:other:main": {
        sessionId: "s2",
        updatedAt: 10,
      },
    });

    const tool = getSessionStatusTool("agent:main:main");

    await expect(tool.execute("call5", { sessionKey: "agent:other:main" })).rejects.toThrow(
      "Agent-to-agent status is disabled",
    );
  });

  it("scopes bare session keys to the requester agent", async () => {
    loadSessionStoreMock.mockClear();
    updateSessionStoreMock.mockClear();
    const stores = new Map<string, Record<string, unknown>>([
      [
        "/tmp/main/sessions.json",
        {
          "agent:main:main": { sessionId: "s-main", updatedAt: 10 },
        },
      ],
      [
        "/tmp/support/sessions.json",
        {
          main: { sessionId: "s-support", updatedAt: 20 },
        },
      ],
    ]);
    loadSessionStoreMock.mockImplementation((storePath: string) => {
      return stores.get(storePath) ?? {};
    });
    updateSessionStoreMock.mockImplementation(
      (_storePath: string, store: Record<string, unknown>) => {
        // Keep map in sync for resolveSessionEntry fallbacks if needed.
        if (_storePath) {
          stores.set(_storePath, store);
        }
      },
    );

    const tool = getSessionStatusTool("agent:support:main");

    const result = await tool.execute("call6", { sessionKey: "main" });
    const details = result.details as { ok?: boolean; sessionKey?: string };
    expect(details.ok).toBe(true);
    expect(details.sessionKey).toBe("main");
  });

  it("resets per-session model override via model=default", async () => {
    resetSessionStore({
      main: {
        sessionId: "s1",
        updatedAt: 10,
        providerOverride: "anthropic",
        modelOverride: "claude-sonnet-4-5",
      },
    });

    const tool = getSessionStatusTool();

    await tool.execute("call3", { model: "default" });
    expect(updateSessionStoreMock).toHaveBeenCalled();
    const [, savedStore] = updateSessionStoreMock.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];
    const saved = savedStore.main as Record<string, unknown>;
    expect(saved.providerOverride).toBeUndefined();
    expect(saved.modelOverride).toBeUndefined();
  });
});
