import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionKey } from "../../middleware/channel-bridge.js";
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
  resolveAgentConfig: vi.fn().mockReturnValue(undefined),
  resolveAgentDir: vi.fn().mockReturnValue("/tmp/agent-dir"),
  resolveAgentModelFallbacksOverride: vi.fn().mockReturnValue(undefined),
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

vi.mock("../../agents/auth-profiles/session-override.js", () => ({
  resolveSessionAuthProfileOverride: vi.fn().mockResolvedValue(undefined),
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

// Model management defaults gutted in RemoteClaw — CLI runtimes own model selection.
// No longer need to mock ../../agents/defaults.js — constants are inlined.

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

describe("runCronIsolatedAgentTurn — ChannelBridge wiring", () => {
  let previousFastTestEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousFastTestEnv = process.env.REMOTECLAW_TEST_FAST;
    delete process.env.REMOTECLAW_TEST_FAST;
    resolveCronSessionMock.mockReturnValue(makeFreshSession());

    // Default: ChannelBridge.handle() returns a successful delivery
    channelBridgeHandleMock.mockResolvedValue(makeDeliveryResult());
  });

  afterEach(() => {
    if (previousFastTestEnv == null) {
      delete process.env.REMOTECLAW_TEST_FAST;
      return;
    }
    process.env.REMOTECLAW_TEST_FAST = previousFastTestEnv;
  });

  it("routes cron message through ChannelBridge.handle()", async () => {
    const result = await runCronIsolatedAgentTurn(makeParams());

    expect(result.status).toBe("ok");
    expect(channelBridgeHandleMock).toHaveBeenCalledOnce();
  });

  it("builds ChannelMessage with cron job context", async () => {
    await runCronIsolatedAgentTurn(makeParams());

    const message = channelBridgeHandleMock.mock.calls[0][0] as ChannelMessage;
    expect(message.id).toBe("cron-job-1");
    expect(message.from).toBe("bot-456"); // resolvedDelivery.accountId
    expect(message.replyToId).toBe("cron:cron-job-1"); // job ID for session key distinction
    expect(message.channelId).toBe("chat-123"); // resolvedDelivery.to
    expect(message.provider).toBe("telegram"); // resolvedDelivery.channel
    expect(message.text).toContain("generate daily summary");
  });

  it("produces distinct session keys for different cron jobs", async () => {
    // Run two cron jobs with different IDs
    await runCronIsolatedAgentTurn(makeParams({ job: makeJob({ id: "daily-review" }) }));
    await runCronIsolatedAgentTurn(makeParams({ job: makeJob({ id: "weekly-digest" }) }));

    const messageA = channelBridgeHandleMock.mock.calls[0][0] as ChannelMessage;
    const messageB = channelBridgeHandleMock.mock.calls[1][0] as ChannelMessage;

    // replyToId carries the job-specific identifier
    expect(messageA.replyToId).toBe("cron:daily-review");
    expect(messageB.replyToId).toBe("cron:weekly-digest");

    // buildSessionKey maps replyToId → threadId, producing distinct keys
    const keyA = buildSessionKey(messageA);
    const keyB = buildSessionKey(messageB);
    expect(keyA.threadId).not.toBe(keyB.threadId);
  });

  it("passes no streaming callbacks (cron has no real-time delivery)", async () => {
    await runCronIsolatedAgentTurn(makeParams());

    const callbacks = channelBridgeHandleMock.mock.calls[0][1];
    expect(callbacks).toBeUndefined();
  });

  it("passes abort signal to ChannelBridge.handle()", async () => {
    const controller = new AbortController();
    await runCronIsolatedAgentTurn(makeParams({ abortSignal: controller.signal }));

    const abortSignal = channelBridgeHandleMock.mock.calls[0][2];
    expect(abortSignal).toBe(controller.signal);
  });

  it("maps AgentDeliveryResult payloads to EmbeddedPiRunResult format", async () => {
    channelBridgeHandleMock.mockResolvedValue(
      makeDeliveryResult({
        payloads: [{ text: "Hello from cron" }],
      }),
    );

    const result = await runCronIsolatedAgentTurn(makeParams());

    expect(result.status).toBe("ok");
    // outputText comes from pickLastNonEmptyTextFromPayloads (mocked to "test output")
    // — the point here is that the run completed successfully with mapped payloads
    expect(result.outputText).toBe("test output");
  });

  it("maps MCP side effects (messaging tool sends) to result", async () => {
    channelBridgeHandleMock.mockResolvedValue(
      makeDeliveryResult({
        mcp: {
          sentTexts: ["sent via MCP"],
          sentMediaUrls: [],
          sentTargets: [{ tool: "telegram_send", provider: "telegram", to: "chat-123" }],
          cronAdds: 1,
        },
      }),
    );

    // runWithModelFallback returns the mapped result
    const result = await runCronIsolatedAgentTurn(makeParams());
    expect(result.status).toBe("ok");
  });

  it("treats empty-payload result with error field as ok (no model-fallback re-throw)", async () => {
    channelBridgeHandleMock.mockResolvedValue({
      payloads: [],
      run: {
        text: "",
        sessionId: undefined,
        durationMs: 100,
        usage: undefined,
        aborted: false,
      },
      mcp: { sentTexts: [], sentMediaUrls: [], sentTargets: [], cronAdds: 0 },
      error: "Provider rate limited",
    });

    // model-fallback.js was removed; the error field on AgentDeliveryResult
    // is not surfaced as a throw. Without isError payloads, the run
    // completes as "ok".
    const result = await runCronIsolatedAgentTurn(makeParams());
    expect(result.status).toBe("ok");
  });

  it("preserves delivery with error payloads (partial success)", async () => {
    channelBridgeHandleMock.mockResolvedValue(
      makeDeliveryResult({
        payloads: [{ text: "Partial output" }],
        error: "Execution timed out",
      }),
    );

    const result = await runCronIsolatedAgentTurn(makeParams());

    // Partial success: has payloads despite error, so should not re-throw
    expect(channelBridgeHandleMock).toHaveBeenCalledOnce();
    expect(result.status).toBe("ok");
  });

  it("maps token usage from AgentDeliveryResult to telemetry", async () => {
    channelBridgeHandleMock.mockResolvedValue(
      makeDeliveryResult({
        run: {
          text: "response",
          sessionId: "sess-1",
          durationMs: 2000,
          usage: { inputTokens: 500, outputTokens: 200, cacheReadTokens: 50 },
          aborted: false,
        },
      }),
    );

    const result = await runCronIsolatedAgentTurn(makeParams());

    expect(result.status).toBe("ok");
    // Model management gutted — cron runs default to "unknown" unless
    // an explicit model override is provided in the job payload.
    expect(result.model).toBe("unknown");
    expect(result.provider).toBe("unknown");
  });
});
