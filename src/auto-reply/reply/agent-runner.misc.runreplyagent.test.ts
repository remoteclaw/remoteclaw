import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import { loadSessionStore, saveSessionStore } from "../../config/sessions.js";
import type { TemplateContext } from "../templating.js";
import type { AgentRunLoopResult } from "./agent-runner-execution.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const state = vi.hoisted(() => ({
  runAgentTurnMock: vi.fn(),
  runtimeErrorMock: vi.fn(),
}));

let runReplyAgentPromise:
  | Promise<(typeof import("./agent-runner.js"))["runReplyAgent"]>
  | undefined;

async function getRunReplyAgent() {
  if (!runReplyAgentPromise) {
    runReplyAgentPromise = import("./agent-runner.js").then((m) => m.runReplyAgent);
  }
  return await runReplyAgentPromise;
}

vi.mock("./agent-runner-execution.js", () => ({
  runAgentTurnWithFallback: (params: unknown) => state.runAgentTurnMock(params),
}));

vi.mock("../../runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../../runtime.js")>("../../runtime.js");
  return {
    ...actual,
    defaultRuntime: {
      ...actual.defaultRuntime,
      log: vi.fn(),
      error: (...args: unknown[]) => state.runtimeErrorMock(...args),
      exit: vi.fn(),
    },
  };
});

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

function makeSuccessResult(
  text: string,
  extra?: Partial<Extract<AgentRunLoopResult, { kind: "success" }>>,
): AgentRunLoopResult {
  return {
    kind: "success",
    runResult: {
      text,
      sessionId: undefined,
      durationMs: 0,
      usage: undefined,
      aborted: false,
      error: undefined,
    },
    didLogHeartbeatStrip: false,
    autoCompactionCompleted: false,
    ...extra,
  };
}

beforeAll(async () => {
  await getRunReplyAgent();
});

beforeEach(() => {
  state.runAgentTurnMock.mockReset();
  state.runtimeErrorMock.mockReset();
  vi.stubEnv("REMOTECLAW_TEST_FAST", "1");
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedSessionStore(params: {
  storePath: string;
  sessionKey: string;
  entry: Record<string, unknown>;
}) {
  await fs.mkdir(path.dirname(params.storePath), { recursive: true });
  await fs.writeFile(
    params.storePath,
    JSON.stringify({ [params.sessionKey]: params.entry }, null, 2),
    "utf-8",
  );
}

function createBaseRun(params: {
  storePath: string;
  sessionEntry: Record<string, unknown>;
  config?: Record<string, unknown>;
}) {
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: "whatsapp",
    OriginatingTo: "+15550001111",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: params.config ?? {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: { enabled: false, allowed: false, defaultLevel: "off" },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
  return { typing, sessionCtx, resolvedQueue, followupRun };
}

describe("runReplyAgent auto-compaction token update", () => {
  it("persists usage and increments compaction count after auto-compaction", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-compact-tokens-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 181_000,
      compactionCount: 0,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

    state.runAgentTurnMock.mockResolvedValue(
      makeSuccessResult("done", {
        autoCompactionCompleted: true,
        runResult: {
          text: "done",
          sessionId: undefined,
          durationMs: 0,
          usage: {
            inputTokens: 10_000,
            outputTokens: 3_000,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          aborted: false,
          error: undefined,
        },
      }),
    );

    // Disable memory flush so we isolate the auto-compaction path
    const config = {
      agents: { defaults: { compaction: { memoryFlush: { enabled: false } } } },
    };
    const { typing, sessionCtx, resolvedQueue, followupRun } = createBaseRun({
      storePath,
      sessionEntry,
      config,
    });

    const runReplyAgent = await getRunReplyAgent();
    await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry,
      sessionStore: { [sessionKey]: sessionEntry },
      sessionKey,
      storePath,
      defaultModel: "anthropic/claude-opus-4-5",
      agentCfgContextTokens: 200_000,
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    // inputTokens and outputTokens should be set from run result usage
    expect(stored[sessionKey].inputTokens).toBe(10_000);
    expect(stored[sessionKey].outputTokens).toBe(3_000);
    // compactionCount should be incremented
    expect(stored[sessionKey].compactionCount).toBe(1);
    // totalTokens is undefined because lastCallUsage is always passed as undefined
    expect(stored[sessionKey].totalTokens).toBeUndefined();
  });

  it("persists usage fields from run result", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-usage-last-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 50_000,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

    state.runAgentTurnMock.mockResolvedValue(
      makeSuccessResult("ok", {
        runResult: {
          text: "ok",
          sessionId: undefined,
          durationMs: 0,
          usage: {
            inputTokens: 55_000,
            outputTokens: 2_000,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          aborted: false,
          error: undefined,
        },
      }),
    );

    const { typing, sessionCtx, resolvedQueue, followupRun } = createBaseRun({
      storePath,
      sessionEntry,
    });

    const runReplyAgent = await getRunReplyAgent();
    await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry,
      sessionStore: { [sessionKey]: sessionEntry },
      sessionKey,
      storePath,
      defaultModel: "anthropic/claude-opus-4-5",
      agentCfgContextTokens: 200_000,
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    // Usage fields should be set from run result
    expect(stored[sessionKey].inputTokens).toBe(55_000);
    expect(stored[sessionKey].outputTokens).toBe(2_000);
    // totalTokens is undefined because lastCallUsage is always passed as undefined
    expect(stored[sessionKey].totalTokens).toBeUndefined();
    expect(stored[sessionKey].totalTokensFresh).toBe(false);
  });
});

describe("runReplyAgent messaging tool suppression", () => {
  function createMessagingRun(
    messageProvider = "slack",
    opts: { storePath?: string; sessionKey?: string } = {},
  ) {
    const typing = createMockTypingController();
    const sessionKey = opts.sessionKey ?? "main";
    const sessionCtx = {
      Provider: messageProvider,
      OriginatingTo: "channel:C1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey,
        messageProvider,
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: {},
        skillsSnapshot: {},
        provider: "anthropic",
        model: "claude",
        thinkLevel: "low",
        verboseLevel: "off",
        elevatedLevel: "off",
        bashElevated: {
          enabled: false,
          allowed: false,
          defaultLevel: "off",
        },
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return async () => {
      const runReplyAgent = await getRunReplyAgent();
      return runReplyAgent({
        commandBody: "hello",
        followupRun,
        queueKey: "main",
        resolvedQueue,
        shouldSteer: false,
        shouldFollowup: false,
        isActive: false,
        isStreaming: false,
        typing,
        sessionCtx,
        sessionKey,
        storePath: opts.storePath,
        defaultModel: "anthropic/claude-opus-4-5",
        resolvedVerboseLevel: "off",
        isNewSession: false,
        blockStreamingEnabled: false,
        resolvedBlockStreamingBreak: "message_end",
        shouldInjectGroupIntro: false,
        typingMode: "instant",
      });
    };
  }

  it("delivers reply text from successful run", async () => {
    state.runAgentTurnMock.mockResolvedValueOnce(makeSuccessResult("hello world!"));

    const run = createMessagingRun("slack");
    const result = await run();

    expect(result).toMatchObject({ text: "hello world!" });
  });

  it("delivers reply text regardless of provider mismatch", async () => {
    // messagingToolSentTargets is always undefined in the new code path,
    // so suppression never happens — replies always deliver.
    state.runAgentTurnMock.mockResolvedValueOnce(makeSuccessResult("hello world!"));

    const run = createMessagingRun("slack");
    const result = await run();

    expect(result).toMatchObject({ text: "hello world!" });
  });

  it("persists usage fields from run result", async () => {
    const storePath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-session-store-")),
      "sessions.json",
    );
    const sessionKey = "main";
    const entry: SessionEntry = { sessionId: "session", updatedAt: Date.now() };
    await saveSessionStore(storePath, { [sessionKey]: entry });

    state.runAgentTurnMock.mockResolvedValueOnce(
      makeSuccessResult("hello world!", {
        runResult: {
          text: "hello world!",
          sessionId: undefined,
          durationMs: 0,
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          aborted: false,
          error: undefined,
        },
      }),
    );

    const run = createMessagingRun("slack", { storePath, sessionKey });
    const result = await run();

    // Replies are always delivered in the new code path (no suppression)
    expect(result).toMatchObject({ text: "hello world!" });

    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[sessionKey]?.inputTokens).toBe(10);
    expect(store[sessionKey]?.outputTokens).toBe(5);
    // totalTokens is undefined because lastCallUsage is always passed as undefined
    expect(store[sessionKey]?.totalTokens).toBeUndefined();
    expect(store[sessionKey]?.totalTokensFresh).toBe(false);
    // model is set from defaultModel (fallbackModel is undefined, so defaultModel is used)
    expect(store[sessionKey]?.model).toBe("anthropic/claude-opus-4-5");
  });
});

describe("runReplyAgent reminder commitment guard", () => {
  function createReminderRun() {
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "telegram",
      OriginatingTo: "chat",
      AccountId: "primary",
      MessageSid: "msg",
      Surface: "telegram",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "telegram",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: {},
        skillsSnapshot: {},
        provider: "anthropic",
        model: "claude",
        thinkLevel: "low",
        verboseLevel: "off",
        elevatedLevel: "off",
        bashElevated: {
          enabled: false,
          allowed: false,
          defaultLevel: "off",
        },
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return async () => {
      const runReplyAgent = await getRunReplyAgent();
      return runReplyAgent({
        commandBody: "hello",
        followupRun,
        queueKey: "main",
        resolvedQueue,
        shouldSteer: false,
        shouldFollowup: false,
        isActive: false,
        isStreaming: false,
        typing,
        sessionCtx,
        sessionKey: "main",
        defaultModel: "anthropic/claude-opus-4-5",
        resolvedVerboseLevel: "off",
        isNewSession: false,
        blockStreamingEnabled: false,
        resolvedBlockStreamingBreak: "message_end",
        shouldInjectGroupIntro: false,
        typingMode: "instant",
      });
    };
  }

  it("appends guard note when reminder commitment is not backed by cron.add", async () => {
    // successfulCronAdds is hardcoded to 0, so the guard always fires
    state.runAgentTurnMock.mockResolvedValueOnce(
      makeSuccessResult("I'll remind you tomorrow morning."),
    );

    const run = createReminderRun();
    const result = await run();
    expect(result).toMatchObject({
      text: "I'll remind you tomorrow morning.\n\nNote: I did not schedule a reminder in this turn, so this will not trigger automatically.",
    });
  });

  it("does not append guard note when text has no reminder commitment", async () => {
    // When the text has no reminder commitment, the guard should not fire
    state.runAgentTurnMock.mockResolvedValueOnce(makeSuccessResult("Here is your answer."));

    const run = createReminderRun();
    const result = await run();
    expect(result).toMatchObject({
      text: "Here is your answer.",
    });
    expect(String((result as { text: string })?.text)).not.toContain(
      "Note: I did not schedule a reminder",
    );
  });
});

describe("runReplyAgent response usage footer", () => {
  function createUsageRun(params: { responseUsage: "tokens" | "full"; sessionKey: string }) {
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "whatsapp",
      OriginatingTo: "+15550001111",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;

    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      responseUsage: params.responseUsage,
    };

    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        agentId: "main",
        agentDir: "/tmp/agent",
        sessionId: "session",
        sessionKey: params.sessionKey,
        messageProvider: "whatsapp",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: {},
        skillsSnapshot: {},
        provider: "anthropic",
        model: "claude",
        thinkLevel: "low",
        verboseLevel: "off",
        elevatedLevel: "off",
        bashElevated: {
          enabled: false,
          allowed: false,
          defaultLevel: "off",
        },
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return async () => {
      const runReplyAgent = await getRunReplyAgent();
      return runReplyAgent({
        commandBody: "hello",
        followupRun,
        queueKey: "main",
        resolvedQueue,
        shouldSteer: false,
        shouldFollowup: false,
        isActive: false,
        isStreaming: false,
        typing,
        sessionCtx,
        sessionEntry,
        sessionKey: params.sessionKey,
        defaultModel: "anthropic/claude-opus-4-5",
        resolvedVerboseLevel: "off",
        isNewSession: false,
        blockStreamingEnabled: false,
        resolvedBlockStreamingBreak: "message_end",
        shouldInjectGroupIntro: false,
        typingMode: "instant",
      });
    };
  }

  it("appends session key when responseUsage=full", async () => {
    // In the new code path:
    // - providerUsed = fallbackProvider ?? "claude-cli" = "claude-cli"
    // - modelUsed = fallbackModel ?? defaultModel = "anthropic/claude-opus-4-5"
    // - usage.input = runResult.usage.inputTokens = 12
    // - usage.output = runResult.usage.outputTokens = 3
    state.runAgentTurnMock.mockResolvedValueOnce(
      makeSuccessResult("ok", {
        runResult: {
          text: "ok",
          sessionId: undefined,
          durationMs: 0,
          usage: {
            inputTokens: 12,
            outputTokens: 3,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          aborted: false,
          error: undefined,
        },
      }),
    );

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const run = createUsageRun({ responseUsage: "full", sessionKey });
    const res = await run();
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).toContain(`· session ${sessionKey}`);
  });

  it("does not append session key when responseUsage=tokens", async () => {
    state.runAgentTurnMock.mockResolvedValueOnce(
      makeSuccessResult("ok", {
        runResult: {
          text: "ok",
          sessionId: undefined,
          durationMs: 0,
          usage: {
            inputTokens: 12,
            outputTokens: 3,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          aborted: false,
          error: undefined,
        },
      }),
    );

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const run = createUsageRun({ responseUsage: "tokens", sessionKey });
    const res = await run();
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).not.toContain("· session ");
  });
});
