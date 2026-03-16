import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelMessage } from "../../middleware/types.js";

// ---------- mocks ----------

const resolveAgentConfigMock = vi.fn();
const channelBridgeHandleMock = vi.fn();

vi.mock("../../middleware/channel-bridge.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../middleware/channel-bridge.js")>();
  return {
    ...actual,
    ChannelBridge: class MockChannelBridge {
      readonly provider: string;
      readonly workspaceDir?: string;

      constructor(opts: { provider: string; workspaceDir?: string }) {
        this.provider = opts.provider;
        this.workspaceDir = opts.workspaceDir;
      }

      handle(message: ChannelMessage, callbacks?: unknown, abortSignal?: AbortSignal) {
        return channelBridgeHandleMock(message, callbacks, abortSignal);
      }
    },
  };
});

vi.mock("../../agents/channel-tools.js", () => ({
  resolveChannelMessageToolHints: vi.fn().mockReturnValue([]),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentConfig: resolveAgentConfigMock,
  resolveAgentDir: vi.fn().mockReturnValue("/tmp/agent-dir"),
  resolveAgentRuntimeArgs: vi.fn().mockReturnValue(undefined),
  resolveAgentRuntimeEnv: vi.fn().mockReturnValue(undefined),
  resolveAgentRuntimeOrThrow: vi.fn().mockReturnValue("claude"),
  resolveAgentWorkspaceDir: vi.fn().mockReturnValue("/tmp/workspace"),
  resolveDefaultAgentId: vi.fn().mockReturnValue("default"),
}));

vi.mock("../../agents/workspace.js", () => ({
  ensureAgentWorkspace: vi.fn().mockResolvedValue("/tmp/workspace"),
}));

// Dead mock — model-selection.js was gutted in this fork but vi.mock still
// needs an entry so the module ID resolves for any transitive imports.
vi.mock("../../agents/model-selection.js", () => ({
  getModelRefStatus: vi.fn().mockReturnValue({ allowed: false }),
  resolveAllowedModelRef: vi.fn().mockReturnValue({
    ref: { provider: "claude", model: "claude-sonnet-4-5" },
  }),
  resolveConfiguredModelRef: vi.fn().mockReturnValue({
    provider: "claude",
    model: "claude-sonnet-4-5",
  }),
  resolveHooksGmailModel: vi.fn().mockReturnValue(null),
}));

vi.mock("../../agents/provider-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../agents/provider-utils.js")>();
  return {
    ...actual,
    isCliProvider: vi.fn().mockReturnValue(true),
  };
});

vi.mock("../../agents/current-time.js", () => ({
  resolveCronStyleNow: vi.fn().mockReturnValue({
    formattedTime: "2026-02-10 12:00",
    timeLine: "[Current time: 2026-02-10 12:00 UTC]",
  }),
}));

vi.mock("../../agents/date-time.js", () => ({
  formatUserTime: vi.fn().mockReturnValue("2026-02-10 12:00"),
  resolveUserTimeFormat: vi.fn().mockReturnValue("24h"),
  resolveUserTimezone: vi.fn().mockReturnValue("UTC"),
}));

vi.mock("../../agents/timeout.js", () => ({
  resolveAgentTimeoutMs: vi.fn().mockReturnValue(60_000),
}));

vi.mock("../../agents/usage.js", () => ({
  deriveSessionTotalTokens: vi.fn().mockReturnValue(30),
  hasNonzeroUsage: vi.fn().mockReturnValue(false),
}));

vi.mock("../../agents/cli-session.js", () => ({
  getCliSessionId: vi.fn().mockReturnValue(undefined),
  setCliSessionId: vi.fn(),
}));

vi.mock("../../auto-reply/thinking.js", () => ({
  normalizeVerboseLevel: vi.fn().mockReturnValue("off"),
}));

vi.mock("../../cli/outbound-send-deps.js", () => ({
  createOutboundSendDeps: vi.fn().mockReturnValue({}),
}));

const updateSessionStoreMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../config/sessions.js", () => ({
  resolveAgentMainSessionKey: vi.fn().mockReturnValue("main:default"),
  updateSessionStore: updateSessionStoreMock,
}));

vi.mock("../../config/paths.js", () => ({
  resolveGatewayPort: vi.fn().mockReturnValue(3579),
}));

vi.mock("../../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: vi.fn().mockReturnValue({ token: "test-token" }),
}));

vi.mock("../../routing/session-key.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../routing/session-key.js")>();
  return {
    ...actual,
    buildAgentMainSessionKey: vi.fn().mockReturnValue("agent:default:cron:test"),
    normalizeAgentId: vi.fn((id: string) => id),
  };
});

vi.mock("../../infra/agent-events.js", () => ({
  registerAgentRunContext: vi.fn(),
}));

const logWarnMock = vi.fn();
vi.mock("../../logger.js", () => ({
  logWarn: logWarnMock,
}));

vi.mock("../../security/external-content.js", () => ({
  buildSafeExternalPrompt: vi.fn().mockReturnValue("safe prompt"),
  detectSuspiciousPatterns: vi.fn().mockReturnValue([]),
  getHookType: vi.fn().mockReturnValue("unknown"),
  isExternalHookSession: vi.fn().mockReturnValue(false),
}));

vi.mock("../delivery.js", () => ({
  resolveCronDeliveryPlan: vi.fn().mockReturnValue({ requested: false }),
}));

vi.mock("./delivery-target.js", () => ({
  resolveDeliveryTarget: vi.fn().mockResolvedValue({
    channel: "discord",
    to: undefined,
    accountId: undefined,
    error: undefined,
    ok: true,
  }),
}));

vi.mock("./delivery-dispatch.js", () => ({
  dispatchCronDelivery: vi.fn().mockResolvedValue({
    delivered: false,
    deliveryAttempted: false,
  }),
  matchesMessagingToolDeliveryTarget: vi.fn().mockReturnValue(false),
  resolveCronDeliveryBestEffort: vi.fn().mockReturnValue(false),
}));

vi.mock("./helpers.js", () => ({
  isHeartbeatOnlyResponse: vi.fn().mockReturnValue(false),
  pickLastDeliverablePayload: vi.fn().mockReturnValue(undefined),
  pickLastNonEmptyTextFromPayloads: vi.fn().mockReturnValue("test output"),
  pickSummaryFromOutput: vi.fn().mockReturnValue("summary"),
  pickSummaryFromPayloads: vi.fn().mockReturnValue("summary"),
  resolveHeartbeatAckMaxChars: vi.fn().mockReturnValue(100),
}));

vi.mock("./session-key.js", () => ({
  resolveCronAgentSessionKey: vi.fn().mockReturnValue("cron:digest:default"),
}));

const resolveCronSessionMock = vi.fn();
vi.mock("./session.js", () => ({
  resolveCronSession: resolveCronSessionMock,
}));

const { runCronIsolatedAgentTurn } = await import("./run.js");

// ---------- helpers ----------

function makeJob(overrides?: Record<string, unknown>) {
  return {
    id: "digest-job",
    name: "Daily Digest",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
    sessionTarget: "isolated",
    payload: {
      kind: "agentTurn",
      message: "run daily digest",
      model: "anthropic/claude-sonnet-4-6",
    },
    ...overrides,
  } as never;
}

function makeParams(overrides?: Record<string, unknown>) {
  return {
    cfg: {},
    deps: {} as never,
    job: makeJob(),
    message: "run daily digest",
    sessionKey: "cron:digest",
    ...overrides,
  };
}

function makeFreshSessionEntry(overrides?: Record<string, unknown>) {
  return {
    sessionId: "test-session-id",
    updatedAt: 0,
    systemSent: false,
    skillsSnapshot: undefined,
    // Crucially: no model or modelProvider -- simulates a brand-new session
    model: undefined as string | undefined,
    modelProvider: undefined as string | undefined,
    ...overrides,
  };
}

/** Build a successful AgentDeliveryResult matching ChannelBridge.handle() shape. */
function makeSuccessfulDeliveryResult(overrides?: Record<string, unknown>) {
  return {
    payloads: [{ text: "digest complete" }],
    run: {
      text: "digest complete",
      sessionId: "cli-session-new",
      durationMs: 1500,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      aborted: false,
      stopReason: "end_turn",
    },
    mcp: {
      sentTexts: [],
      sentMediaUrls: [],
      sentTargets: [],
      cronAdds: 0,
    },
    error: undefined,
    ...overrides,
  };
}

// ---------- tests ----------

describe("runCronIsolatedAgentTurn -- cron model override (#21057)", () => {
  let previousFastTestEnv: string | undefined;
  // Hold onto the cron session *object* -- the code may reassign its
  // `sessionEntry` property (e.g. during skills snapshot refresh), so
  // checking a stale reference would give a false negative.
  let cronSession: {
    sessionEntry: ReturnType<typeof makeFreshSessionEntry>;
    [k: string]: unknown;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    previousFastTestEnv = process.env.REMOTECLAW_TEST_FAST;
    delete process.env.REMOTECLAW_TEST_FAST;

    resolveAgentConfigMock.mockReturnValue(undefined);
    updateSessionStoreMock.mockResolvedValue(undefined);

    // Default: ChannelBridge.handle() returns a successful delivery
    channelBridgeHandleMock.mockResolvedValue(makeSuccessfulDeliveryResult());

    cronSession = {
      storePath: "/tmp/store.json",
      store: {},
      sessionEntry: makeFreshSessionEntry(),
      systemSent: false,
      isNewSession: true,
    };
    resolveCronSessionMock.mockReturnValue(cronSession);
  });

  afterEach(() => {
    if (previousFastTestEnv == null) {
      delete process.env.REMOTECLAW_TEST_FAST;
      return;
    }
    process.env.REMOTECLAW_TEST_FAST = previousFastTestEnv;
  });

  it("persists cron payload model on session entry even when the run throws", async () => {
    // Simulate the agent run throwing (e.g. LLM provider timeout)
    channelBridgeHandleMock.mockRejectedValueOnce(new Error("LLM provider timeout"));

    const result = await runCronIsolatedAgentTurn(makeParams());

    expect(result.status).toBe("error");

    // The session entry should record the intended cron model override (Sonnet)
    // so that sessions_list does not fall back to the agent default.
    //
    // BUG (#21057): before the fix, the model was only written to the session
    // entry AFTER a successful run (in the post-run telemetry block), so it
    // remained undefined when the run threw in the catch block.
    expect(cronSession.sessionEntry.model).toBe("claude-sonnet-4-6");
    expect(cronSession.sessionEntry.modelProvider).toBe("anthropic");
    expect(cronSession.sessionEntry.systemSent).toBe(true);
  });

  it("session entry already carries cron model at pre-run persist time (race condition)", async () => {
    // Capture a deep snapshot of the session entry at each persist call so we
    // can inspect what sessions_list would see mid-run -- before the post-run
    // persist overwrites the entry with the actual model from agentMeta.
    const persistedSnapshots: Array<{
      model?: string;
      modelProvider?: string;
      systemSent?: boolean;
    }> = [];
    updateSessionStoreMock.mockImplementation(
      async (_path: string, cb: (s: Record<string, unknown>) => void) => {
        const store: Record<string, unknown> = {};
        cb(store);
        const entry = Object.values(store)[0] as
          | { model?: string; modelProvider?: string; systemSent?: boolean }
          | undefined;
        if (entry) {
          persistedSnapshots.push(JSON.parse(JSON.stringify(entry)));
        }
      },
    );

    channelBridgeHandleMock.mockResolvedValueOnce(makeSuccessfulDeliveryResult());

    await runCronIsolatedAgentTurn(makeParams());

    // Persist ordering: [0] pre-run model+systemSent, [1] post-run telemetry.
    // Index 0 is what a concurrent sessions_list would read while the agent
    // run is in flight.
    expect(persistedSnapshots.length).toBeGreaterThanOrEqual(2);
    const preRunSnapshot = persistedSnapshots[0];
    expect(preRunSnapshot.model).toBe("claude-sonnet-4-6");
    expect(preRunSnapshot.modelProvider).toBe("anthropic");
    expect(preRunSnapshot.systemSent).toBe(true);
  });

  it("persists session-level /model override on session entry before the run", async () => {
    // No cron payload model -- the job has no model field
    const jobWithoutModel = makeJob({
      payload: { kind: "agentTurn", message: "run daily digest" },
    });

    // Session-level /model override set by user (e.g. via /model command)
    cronSession.sessionEntry = makeFreshSessionEntry({
      modelOverride: "claude-haiku-4-5",
      providerOverride: "anthropic",
    });
    resolveCronSessionMock.mockReturnValue(cronSession);

    channelBridgeHandleMock.mockRejectedValueOnce(new Error("LLM provider timeout"));

    const result = await runCronIsolatedAgentTurn(makeParams({ job: jobWithoutModel }));

    expect(result.status).toBe("error");
    // Even though the run failed, the session-level model override should
    // be persisted on the entry -- not the agent default.
    expect(cronSession.sessionEntry.model).toBe("claude-haiku-4-5");
    expect(cronSession.sessionEntry.modelProvider).toBe("anthropic");
  });

  it("logs warning and continues when pre-run persist fails", async () => {
    // The pre-run persist (call 1) should fail.
    let callCount = 0;
    updateSessionStoreMock.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("ENOSPC: no space left on device");
      }
    });

    channelBridgeHandleMock.mockResolvedValueOnce(makeSuccessfulDeliveryResult());

    const result = await runCronIsolatedAgentTurn(makeParams());

    // The run should still complete successfully despite the persist failure
    expect(result.status).toBe("ok");
    expect(logWarnMock).toHaveBeenCalledWith(
      expect.stringContaining("Failed to persist pre-run session entry"),
    );
  });

  it("persists default model pre-run when no payload override is present", async () => {
    // No cron payload model override
    const jobWithoutModel = makeJob({
      payload: { kind: "agentTurn", message: "run daily digest" },
    });

    channelBridgeHandleMock.mockRejectedValueOnce(new Error("LLM provider timeout"));

    const result = await runCronIsolatedAgentTurn(makeParams({ job: jobWithoutModel }));

    expect(result.status).toBe("error");
    // With no override, the default model (from normalizeModelRef("unknown","unknown"))
    // should still be persisted on the session entry rather than left undefined.
    expect(cronSession.sessionEntry.model).toBe("unknown");
    expect(cronSession.sessionEntry.modelProvider).toBe("unknown");
  });
});
