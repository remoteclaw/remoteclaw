import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelMessage } from "../../middleware/types.js";

// ---------- mocks ----------

const channelBridgeHandleMock = vi.fn();

vi.mock("../../middleware/channel-bridge.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../middleware/channel-bridge.js")>();
  return {
    ...actual,
    ChannelBridge: class MockChannelBridge {
      readonly provider: string;
      readonly workspaceDir?: string;
      readonly runtimeEnv?: Record<string, string>;

      constructor(opts: {
        provider: string;
        workspaceDir?: string;
        runtimeEnv?: Record<string, string>;
      }) {
        this.provider = opts.provider;
        this.workspaceDir = opts.workspaceDir;
        this.runtimeEnv = opts.runtimeEnv;
      }

      handle(message: ChannelMessage, callbacks?: unknown, abortSignal?: AbortSignal) {
        return channelBridgeHandleMock(message, callbacks, abortSignal, this.runtimeEnv);
      }
    },
  };
});

const withAuthKeyRetryMock = vi.fn();
vi.mock("../../middleware/auth-key-retry.js", () => ({
  withAuthKeyRetry: withAuthKeyRetryMock,
}));

vi.mock("../../agents/channel-tools.js", () => ({
  resolveChannelMessageToolHints: vi.fn().mockReturnValue([]),
}));

const resolveAgentRuntimeEnvMock = vi.fn();
vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentConfig: vi.fn().mockReturnValue(undefined),
  resolveAgentDir: vi.fn().mockReturnValue("/tmp/agent-dir"),
  resolveAgentRuntime: vi.fn().mockReturnValue("claude"),
  resolveAgentRuntimeArgs: vi.fn().mockReturnValue(undefined),
  resolveAgentRuntimeEnv: resolveAgentRuntimeEnvMock,
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

function makeFreshSession() {
  return {
    storePath: "/tmp/store.json",
    store: {},
    sessionEntry: {
      sessionId: "test-session-id",
      updatedAt: 0,
      systemSent: false,
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

describe("runCronIsolatedAgentTurn — auth key retry wiring", () => {
  let previousFastTestEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousFastTestEnv = process.env.REMOTECLAW_TEST_FAST;
    delete process.env.REMOTECLAW_TEST_FAST;
    resolveCronSessionMock.mockReturnValue(makeFreshSession());
    resolveAgentRuntimeEnvMock.mockReturnValue(undefined);

    // Default: withAuthKeyRetry passes through to the execute callback
    withAuthKeyRetryMock.mockImplementation(
      async (
        options: { baseEnv?: Record<string, string> },
        execute: (env: Record<string, string>) => Promise<unknown>,
      ) => execute(options.baseEnv ?? {}),
    );

    channelBridgeHandleMock.mockResolvedValue(makeDeliveryResult());
  });

  afterEach(() => {
    if (previousFastTestEnv == null) {
      delete process.env.REMOTECLAW_TEST_FAST;
      return;
    }
    process.env.REMOTECLAW_TEST_FAST = previousFastTestEnv;
  });

  it("wraps bridge execution with withAuthKeyRetry", async () => {
    await runCronIsolatedAgentTurn(makeParams());

    expect(withAuthKeyRetryMock).toHaveBeenCalledOnce();
  });

  it("passes cfgWithAgentDefaults and agentId to withAuthKeyRetry", async () => {
    await runCronIsolatedAgentTurn(makeParams({ agentId: "custom-agent" }));

    const options = withAuthKeyRetryMock.mock.calls[0][0];
    expect(options.cfg).toBeDefined();
    expect(options.agentId).toBe("custom-agent");
  });

  it("passes resolveAgentRuntimeEnv result as baseEnv", async () => {
    const runtimeEnv = { CLAUDE_CONFIG_DIR: "/home/user/.config/claude" };
    resolveAgentRuntimeEnvMock.mockReturnValue(runtimeEnv);

    await runCronIsolatedAgentTurn(makeParams());

    const options = withAuthKeyRetryMock.mock.calls[0][0];
    expect(options.baseEnv).toEqual(runtimeEnv);
  });

  it("passes undefined baseEnv when resolveAgentRuntimeEnv returns undefined", async () => {
    resolveAgentRuntimeEnvMock.mockReturnValue(undefined);

    await runCronIsolatedAgentTurn(makeParams());

    const options = withAuthKeyRetryMock.mock.calls[0][0];
    expect(options.baseEnv).toBeUndefined();
  });

  it("provides error extractor that reads result.error", async () => {
    await runCronIsolatedAgentTurn(makeParams());

    const getErrorMessage = withAuthKeyRetryMock.mock.calls[0][2];
    expect(getErrorMessage({ error: "rate limit exceeded" })).toBe("rate limit exceeded");
    expect(getErrorMessage({ error: undefined })).toBeUndefined();
    expect(getErrorMessage({})).toBeUndefined();
  });

  it("creates ChannelBridge with runtimeEnv from withAuthKeyRetry callback", async () => {
    const injectedEnv = {
      CLAUDE_CONFIG_DIR: "/home/user/.config/claude",
      ANTHROPIC_API_KEY: "sk-test-injected",
    };

    withAuthKeyRetryMock.mockImplementation(
      async (_options: unknown, execute: (env: Record<string, string>) => Promise<unknown>) =>
        execute(injectedEnv),
    );

    await runCronIsolatedAgentTurn(makeParams());

    // The mock ChannelBridge passes runtimeEnv as 4th arg to handle mock
    const runtimeEnvPassedToBridge = channelBridgeHandleMock.mock.calls[0][3];
    expect(runtimeEnvPassedToBridge).toEqual(injectedEnv);
  });

  it("default agentId falls back to resolveDefaultAgentId", async () => {
    await runCronIsolatedAgentTurn(makeParams());

    const options = withAuthKeyRetryMock.mock.calls[0][0];
    expect(options.agentId).toBe("default");
  });

  it("returns result from withAuthKeyRetry callback", async () => {
    const result = await runCronIsolatedAgentTurn(makeParams());

    expect(result.status).toBe("ok");
    expect(channelBridgeHandleMock).toHaveBeenCalledOnce();
  });

  it("propagates thrown errors from withAuthKeyRetry", async () => {
    withAuthKeyRetryMock.mockRejectedValue(new Error("all auth keys exhausted"));

    const result = await runCronIsolatedAgentTurn(makeParams());

    expect(result.status).toBe("error");
    expect(result.error).toContain("all auth keys exhausted");
  });
});
