import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------- mocks ----------

const mockHandle = vi.fn();
const buildWorkspaceSkillSnapshotMock = vi.fn();
const resolveAgentConfigMock = vi.fn();

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentConfig: resolveAgentConfigMock,
  resolveAgentDir: vi.fn().mockReturnValue("/tmp/agent-dir"),
  resolveAgentModelFallbacksOverride: vi.fn().mockReturnValue(undefined),
  resolveAgentWorkspaceDir: vi.fn().mockReturnValue("/tmp/workspace"),
  resolveDefaultAgentId: vi.fn().mockReturnValue("default"),
  resolveAgentSkillsFilter: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn().mockReturnValue({}),
}));

vi.mock("../../agents/auth-profiles/session-override.js", () => ({
  resolveSessionAuthProfileOverride: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../agents/skills.js", () => ({
  buildWorkspaceSkillSnapshot: buildWorkspaceSkillSnapshotMock,
}));

vi.mock("../../agents/skills/refresh.js", () => ({
  getSkillsSnapshotVersion: vi.fn().mockReturnValue(42),
}));

vi.mock("../../agents/workspace.js", () => ({
  ensureAgentWorkspace: vi.fn().mockResolvedValue({ dir: "/tmp/workspace" }),
}));

vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn().mockResolvedValue({ models: [] }),
}));

vi.mock("../../agents/model-auth.js", () => ({
  resolveApiKeyForProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../agents/model-selection.js", () => ({
  getModelRefStatus: vi.fn().mockReturnValue({ allowed: false }),
  isCliProvider: vi.fn().mockReturnValue(false),
  resolveAllowedModelRef: vi.fn().mockReturnValue({ ref: { provider: "openai", model: "gpt-4" } }),
  resolveConfiguredModelRef: vi.fn().mockReturnValue({ provider: "openai", model: "gpt-4" }),
  resolveHooksGmailModel: vi.fn().mockReturnValue(null),
  resolveThinkingDefault: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../middleware/index.js")>();
  return {
    ...actual,
    ChannelBridge: vi.fn(),
    ClaudeCliRuntime: vi.fn(),
  };
});

vi.mock("../../agents/context.js", () => ({
  lookupContextTokens: vi.fn().mockReturnValue(128000),
}));

vi.mock("../../agents/current-time.js", () => ({
  resolveCronStyleNow: vi.fn().mockReturnValue({
    formattedTime: "2026-02-10 12:00",
    timeLine: "Current time: 2026-02-10 12:00 (UTC)",
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

vi.mock("../../agents/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../agents/cli-session.js", () => ({
  getCliSessionId: vi.fn().mockReturnValue(undefined),
  setCliSessionId: vi.fn(),
}));

vi.mock("../../auto-reply/thinking.js", () => ({
  normalizeThinkLevel: vi.fn().mockReturnValue(undefined),
  normalizeVerboseLevel: vi.fn().mockReturnValue("off"),
  supportsXHighThinking: vi.fn().mockReturnValue(false),
}));

vi.mock("../../cli/outbound-send-deps.js", () => ({
  createOutboundSendDeps: vi.fn().mockReturnValue({}),
}));

vi.mock("../../config/sessions.js", () => ({
  resolveAgentMainSessionKey: vi.fn().mockReturnValue("main:default"),
  resolveSessionTranscriptPath: vi.fn().mockReturnValue("/tmp/transcript.jsonl"),
  updateSessionStore: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../../infra/skills-remote.js", () => ({
  getRemoteSkillEligibility: vi.fn().mockReturnValue({}),
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
    channel: "discord",
    to: undefined,
    accountId: undefined,
    error: undefined,
  }),
}));

vi.mock("./helpers.js", () => ({
  isHeartbeatOnlyResponse: vi.fn().mockReturnValue(false),
  pickLastDeliverablePayload: vi.fn().mockReturnValue(undefined),
  pickLastNonEmptyTextFromPayloads: vi.fn().mockReturnValue("test output"),
  pickSummaryFromOutput: vi.fn().mockReturnValue("summary"),
  pickSummaryFromPayloads: vi.fn().mockReturnValue("summary"),
  resolveHeartbeatAckMaxChars: vi.fn().mockReturnValue(100),
}));

const resolveCronSessionMock = vi.fn();
vi.mock("./session.js", () => ({
  resolveCronSession: resolveCronSessionMock,
}));

vi.mock("../../agents/defaults.js", () => ({
  DEFAULT_CONTEXT_TOKENS: 128000,
  DEFAULT_MODEL: "gpt-4",
  DEFAULT_PROVIDER: "openai",
}));

import { ChannelBridge } from "../../middleware/index.js";

const { runCronIsolatedAgentTurn } = await import("./run.js");

// ---------- helpers ----------

function makeJob(overrides?: Record<string, unknown>) {
  return {
    id: "test-job",
    name: "Test Job",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
    sessionTarget: "isolated",
    payload: { kind: "agentTurn", message: "test" },
    ...overrides,
  } as never;
}

function makeParams(overrides?: Record<string, unknown>) {
  return {
    cfg: {},
    deps: {} as never,
    job: makeJob(),
    message: "test",
    sessionKey: "cron:test",
    ...overrides,
  };
}

// ---------- tests ----------

describe("runCronIsolatedAgentTurn — skill snapshot", () => {
  let previousFastTestEnv: string | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    previousFastTestEnv = process.env.REMOTECLAW_TEST_FAST;
    delete process.env.REMOTECLAW_TEST_FAST;
    vi.mocked(ChannelBridge).mockImplementation(function () {
      return { handle: mockHandle };
    } as never);
    mockHandle.mockReset();
    mockHandle.mockResolvedValue({
      text: "test output",
      sessionId: "test-session-id",
      durationMs: 5,
      usage: undefined,
      aborted: false,
      error: undefined,
    });
    buildWorkspaceSkillSnapshotMock.mockReturnValue({
      prompt: "<available_skills></available_skills>",
      resolvedSkills: [],
      version: 42,
    });
    resolveAgentConfigMock.mockReturnValue(undefined);
    // Fresh session object per test — prevents mutation leaking between tests
    resolveCronSessionMock.mockReturnValue({
      storePath: "/tmp/store.json",
      store: {},
      sessionEntry: {
        sessionId: "test-session-id",
        updatedAt: 0,
        systemSent: false,
        skillsSnapshot: undefined,
      },
      systemSent: false,
      isNewSession: true,
    });
  });

  afterEach(() => {
    if (previousFastTestEnv == null) {
      delete process.env.REMOTECLAW_TEST_FAST;
      return;
    }
    process.env.REMOTECLAW_TEST_FAST = previousFastTestEnv;
  });

  it("builds skill snapshot when session has none cached", async () => {
    const result = await runCronIsolatedAgentTurn(
      makeParams({
        cfg: { agents: { list: [{ id: "scout" }] } },
        agentId: "scout",
      }),
    );

    expect(result.status).toBe("ok");
    expect(buildWorkspaceSkillSnapshotMock).toHaveBeenCalledOnce();
  });

  it("reuses cached snapshot when version is unchanged", async () => {
    resolveCronSessionMock.mockReturnValue({
      storePath: "/tmp/store.json",
      store: {},
      sessionEntry: {
        sessionId: "test-session-id",
        updatedAt: 0,
        systemSent: false,
        skillsSnapshot: {
          prompt: "<available_skills><skill>weather</skill></available_skills>",
          skills: [{ name: "weather" }],
          version: 42,
        },
      },
      systemSent: false,
      isNewSession: true,
    });

    const result = await runCronIsolatedAgentTurn(
      makeParams({
        cfg: { agents: { list: [{ id: "weather-bot" }] } },
        agentId: "weather-bot",
      }),
    );

    expect(result.status).toBe("ok");
    expect(buildWorkspaceSkillSnapshotMock).not.toHaveBeenCalled();
  });
});
