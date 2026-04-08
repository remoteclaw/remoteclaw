import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------- mocks ----------

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

      handle(
        message: import("../../middleware/types.js").ChannelMessage,
        callbacks?: unknown,
        abortSignal?: AbortSignal,
      ) {
        return channelBridgeHandleMock(message, callbacks, abortSignal);
      }
    },
  };
});

vi.mock("../../middleware/auth-key-retry.js", () => ({
  withAuthKeyRetry: vi.fn(
    async (_options: unknown, execute: (env: Record<string, string>) => Promise<unknown>) =>
      execute({}),
  ),
}));

vi.mock("../../agents/channel-tools.js", () => ({
  resolveChannelMessageToolHints: vi.fn().mockReturnValue([]),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentConfig: vi.fn().mockReturnValue(undefined),
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

vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn().mockResolvedValue({ models: [] }),
}));

vi.mock("../../agents/model-selection.js", () => ({
  getModelRefStatus: vi.fn().mockReturnValue({ allowed: false }),
  resolveAllowedModelRef: vi
    .fn()
    .mockReturnValue({ ref: { provider: "claude", model: "claude-sonnet-4-5" } }),
  resolveConfiguredModelRef: vi
    .fn()
    .mockReturnValue({ provider: "claude", model: "claude-sonnet-4-5" }),
  resolveHooksGmailModel: vi.fn().mockReturnValue(null),
}));

vi.mock("../../agents/provider-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../agents/provider-utils.js")>();
  return {
    ...actual,
    isCliProvider: vi.fn().mockReturnValue(true),
  };
});

vi.mock("../../agents/context.js", () => ({
  lookupContextTokens: vi.fn().mockReturnValue(128000),
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
  getCliSessionId: vi.fn().mockReturnValue("cli-session-123"),
  setCliSessionId: vi.fn(),
}));

vi.mock("../../auto-reply/thinking.js", () => ({
  normalizeVerboseLevel: vi.fn().mockReturnValue("off"),
}));

vi.mock("../../cli/outbound-send-deps.js", () => ({
  createOutboundSendDeps: vi.fn().mockReturnValue({}),
}));

vi.mock("../../config/sessions.js", () => ({
  resolveAgentMainSessionKey: vi.fn().mockReturnValue("main:default"),
  updateSessionStore: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../logger.js", () => ({
  logWarn: vi.fn(),
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
    ok: true,
    channel: "telegram",
    to: "chat-123",
    accountId: "bot-456",
    mode: "explicit",
  }),
}));

vi.mock("./helpers.js", () => ({
  pickLastDeliverablePayload: vi.fn().mockReturnValue(undefined),
  pickLastNonEmptyTextFromPayloads: vi.fn().mockReturnValue("test output"),
  pickSummaryFromOutput: vi.fn().mockReturnValue("summary"),
  pickSummaryFromPayloads: vi.fn().mockReturnValue("summary"),
}));

vi.mock("./delivery-dispatch.js", () => ({
  dispatchCronDelivery: vi.fn().mockResolvedValue({
    delivered: false,
    summary: "summary",
    outputText: "test output",
  }),
  matchesMessagingToolDeliveryTarget: vi.fn().mockReturnValue(false),
  resolveCronDeliveryBestEffort: vi.fn().mockReturnValue(false),
}));

const resolveCronSessionMock = vi.fn();
vi.mock("./session.js", () => ({
  resolveCronSession: resolveCronSessionMock,
}));

const { runCronIsolatedAgentTurn } = await import("./run.js");

// ---------- helpers ----------

function makeJob(overrides?: Record<string, unknown>) {
  return {
    id: "cron-job-1",
    name: "Daily Summary",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
    sessionTarget: "isolated",
    sessionKey: "cron:cron-job-1",
    payload: { kind: "agentTurn", message: "generate summary" },
    ...overrides,
  } as never;
}

function makeParams(overrides?: Record<string, unknown>) {
  return {
    cfg: { agents: { defaults: { runtime: "claude" as const } } },
    deps: {} as never,
    job: makeJob(),
    message: "generate daily summary",
    sessionKey: "cron:test",
    ...overrides,
  };
}

function makeFreshSession(sessionEntryOverrides?: Record<string, unknown>): {
  storePath: string;
  store: Record<string, unknown>;
  sessionEntry: {
    sessionId: string;
    updatedAt: number;
    systemSent: boolean;
    model?: string;
    modelProvider?: string;
    modelOverride?: string;
    providerOverride?: string;
    [k: string]: unknown;
  };
  systemSent: boolean;
  isNewSession: boolean;
} {
  return {
    storePath: "/tmp/store.json",
    store: {},
    sessionEntry: {
      sessionId: "test-session-id",
      updatedAt: 0,
      systemSent: false,
      ...sessionEntryOverrides,
    },
    systemSent: false,
    isNewSession: true,
  };
}

function makeDeliveryResult(overrides?: Record<string, unknown>) {
  return {
    payloads: [{ text: "Agent response" }],
    run: {
      text: "Agent response",
      sessionId: "cli-session-new",
      durationMs: 1500,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5 },
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

describe("runCronIsolatedAgentTurn — cron model override (telemetry vs session entry)", () => {
  let previousFastTestEnv: string | undefined;
  let cronSession: ReturnType<typeof makeFreshSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    previousFastTestEnv = process.env.REMOTECLAW_TEST_FAST;
    delete process.env.REMOTECLAW_TEST_FAST;
    cronSession = makeFreshSession();
    resolveCronSessionMock.mockReturnValue(cronSession);
    channelBridgeHandleMock.mockResolvedValue(makeDeliveryResult());
  });

  afterEach(() => {
    if (previousFastTestEnv == null) {
      delete process.env.REMOTECLAW_TEST_FAST;
      return;
    }
    process.env.REMOTECLAW_TEST_FAST = previousFastTestEnv;
  });

  it("telemetry uses runtime field, session entry uses model/modelProvider", async () => {
    const result = await runCronIsolatedAgentTurn(
      makeParams({
        job: makeJob({
          payload: {
            kind: "agentTurn",
            message: "generate summary",
            model: "anthropic/claude-sonnet-4-6",
          },
        }),
      }),
    );

    expect(result.status).toBe("ok");

    // Telemetry: runtime comes from resolveAgentRuntimeOrThrow (mocked → "claude"),
    // not from the model override
    expect(result.runtime).toBe("claude");

    // Result does NOT carry model/provider — those are session-entry-only fields
    expect("model" in result).toBe(false);
    expect("provider" in result).toBe(false);

    // Session entry: model/modelProvider reflect the payload override
    expect(cronSession.sessionEntry.model).toBe("claude-sonnet-4-6");
    expect(cronSession.sessionEntry.modelProvider).toBe("anthropic");
  });

  it("persists payload model override on session entry after successful run", async () => {
    const result = await runCronIsolatedAgentTurn(
      makeParams({
        job: makeJob({
          payload: {
            kind: "agentTurn",
            message: "generate summary",
            model: "anthropic/claude-sonnet-4-6",
          },
        }),
      }),
    );

    expect(result.status).toBe("ok");
    expect(cronSession.sessionEntry.model).toBe("claude-sonnet-4-6");
    expect(cronSession.sessionEntry.modelProvider).toBe("anthropic");
  });

  it("defaults model to 'unknown' on session entry when no override is present", async () => {
    // Job has no model override
    const result = await runCronIsolatedAgentTurn(
      makeParams({
        job: makeJob({
          payload: { kind: "agentTurn", message: "generate summary" },
        }),
      }),
    );

    expect(result.status).toBe("ok");
    expect(result.runtime).toBe("claude");
    // Without model override, defaults from normalizeModelRef("unknown", "unknown")
    expect(cronSession.sessionEntry.model).toBe("unknown");
    expect(cronSession.sessionEntry.modelProvider).toBe("unknown");
  });

  it("returns error for unparseable model in payload", async () => {
    const result = await runCronIsolatedAgentTurn(
      makeParams({
        job: makeJob({
          payload: {
            kind: "agentTurn",
            message: "generate summary",
            model: "/",
          },
        }),
      }),
    );

    expect(result.status).toBe("error");
    expect(result.error).toContain("Unrecognized model");
    // ChannelBridge was never called
    expect(channelBridgeHandleMock).not.toHaveBeenCalled();
    // Session entry model was never set (early return before execution)
    expect(cronSession.sessionEntry.model).toBeUndefined();
    expect(cronSession.sessionEntry.modelProvider).toBeUndefined();
  });

  it("honors session-level model override when no payload model is present", async () => {
    cronSession = makeFreshSession({
      modelOverride: "claude-haiku-4-5",
      providerOverride: "anthropic",
    });
    resolveCronSessionMock.mockReturnValue(cronSession);

    const result = await runCronIsolatedAgentTurn(
      makeParams({
        job: makeJob({
          payload: { kind: "agentTurn", message: "generate summary" },
        }),
      }),
    );

    expect(result.status).toBe("ok");
    expect(result.runtime).toBe("claude");
    // Session entry reflects the session-level override
    expect(cronSession.sessionEntry.model).toBe("claude-haiku-4-5");
    expect(cronSession.sessionEntry.modelProvider).toBe("anthropic");
  });

  it("does not persist model on session entry when ChannelBridge throws", async () => {
    channelBridgeHandleMock.mockRejectedValueOnce(new Error("LLM provider timeout"));

    const result = await runCronIsolatedAgentTurn(
      makeParams({
        job: makeJob({
          payload: {
            kind: "agentTurn",
            message: "generate summary",
            model: "anthropic/claude-sonnet-4-6",
          },
        }),
      }),
    );

    expect(result.status).toBe("error");
    expect(result.error).toContain("LLM provider timeout");
    // Post-run model persistence never reached (catch block returns early)
    expect(cronSession.sessionEntry.model).toBeUndefined();
    expect(cronSession.sessionEntry.modelProvider).toBeUndefined();
    // No telemetry on error path
    expect(result.runtime).toBeUndefined();
  });
});
