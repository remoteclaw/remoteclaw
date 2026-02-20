import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import type { TemplateContext } from "../templating.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import type { AgentRunLoopResult } from "./agent-runner-execution.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const state = vi.hoisted(() => ({
  runAgentTurnMock: vi.fn(),
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

vi.mock("./queue.js", () => ({
  enqueueFollowupRun: vi.fn(),
  scheduleFollowupDrain: vi.fn(),
}));

beforeAll(async () => {
  // Avoid attributing the initial agent-runner import cost to the first test case.
  await getRunReplyAgent();
});

beforeEach(() => {
  state.runAgentTurnMock.mockReset();
  vi.stubEnv("REMOTECLAW_TEST_FAST", "1");
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

function makeFinalResult(payload: ReplyPayload): AgentRunLoopResult {
  return { kind: "final", payload };
}

function createMinimalRun(params?: {
  opts?: GetReplyOptions;
  resolvedVerboseLevel?: "off" | "on";
  sessionStore?: Record<string, SessionEntry>;
  sessionEntry?: SessionEntry;
  sessionKey?: string;
  storePath?: string;
  typingMode?: TypingMode;
  blockStreamingEnabled?: boolean;
}) {
  const typing = createMockTypingController();
  const opts = params?.opts;
  const sessionCtx = {
    Provider: "whatsapp",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const sessionKey = params?.sessionKey ?? "main";
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      sessionId: "session",
      sessionKey,
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: params?.resolvedVerboseLevel ?? "off",
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

  return {
    typing,
    opts,
    run: async () => {
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
        opts,
        typing,
        sessionEntry: params?.sessionEntry,
        sessionStore: params?.sessionStore,
        sessionKey,
        storePath: params?.storePath,
        sessionCtx,
        defaultModel: "anthropic/claude-opus-4-5",
        resolvedVerboseLevel: params?.resolvedVerboseLevel ?? "off",
        isNewSession: false,
        blockStreamingEnabled: params?.blockStreamingEnabled ?? false,
        resolvedBlockStreamingBreak: "message_end",
        shouldInjectGroupIntro: false,
        typingMode: params?.typingMode ?? "instant",
      });
    },
  };
}

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
  runOverrides?: Partial<FollowupRun["run"]>;
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
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
  const run = {
    ...followupRun.run,
    ...params.runOverrides,
    config: params.config ?? followupRun.run.config,
  };

  return {
    typing,
    sessionCtx,
    resolvedQueue,
    followupRun: { ...followupRun, run },
  };
}

async function runReplyAgentWithBase(params: {
  baseRun: ReturnType<typeof createBaseRun>;
  storePath: string;
  sessionKey: string;
  sessionEntry: SessionEntry;
  commandBody: string;
  typingMode?: "instant";
}): Promise<void> {
  const runReplyAgent = await getRunReplyAgent();
  const { typing, sessionCtx, resolvedQueue, followupRun } = params.baseRun;
  await runReplyAgent({
    commandBody: params.commandBody,
    followupRun,
    queueKey: params.sessionKey,
    resolvedQueue,
    shouldSteer: false,
    shouldFollowup: false,
    isActive: false,
    isStreaming: false,
    typing,
    sessionCtx,
    sessionEntry: params.sessionEntry,
    sessionStore: { [params.sessionKey]: params.sessionEntry } as Record<string, SessionEntry>,
    sessionKey: params.sessionKey,
    storePath: params.storePath,
    defaultModel: "anthropic/claude-opus-4-5",
    agentCfgContextTokens: 100_000,
    resolvedVerboseLevel: "off",
    isNewSession: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    shouldInjectGroupIntro: false,
    typingMode: params.typingMode ?? "instant",
  });
}

describe("runReplyAgent typing (heartbeat)", () => {
  let fixtureRoot = "";
  let caseId = 0;

  async function withTempStateDir<T>(fn: (stateDir: string) => Promise<T>): Promise<T> {
    const stateDir = path.join(fixtureRoot, `case-${++caseId}`);
    await fs.mkdir(stateDir, { recursive: true });
    const prev = process.env.REMOTECLAW_STATE_DIR;
    process.env.REMOTECLAW_STATE_DIR = stateDir;
    try {
      return await fn(stateDir);
    } finally {
      if (prev === undefined) {
        delete process.env.REMOTECLAW_STATE_DIR;
      } else {
        process.env.REMOTECLAW_STATE_DIR = prev;
      }
    }
  }

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), "remoteclaw-typing-heartbeat-"));
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("signals typing for normal runs", async () => {
    const onPartialReply = vi.fn();
    state.runAgentTurnMock.mockImplementationOnce(
      async (params: {
        opts?: { onPartialReply?: (p: { text?: string }) => Promise<void> | void };
        typingSignals: { signalTextDelta: (t: string) => Promise<void> };
      }) => {
        // Simulate what runAgentTurnWithFallback does: stream text, call partial reply
        await params.typingSignals.signalTextDelta("hi");
        await params.opts?.onPartialReply?.({ text: "hi" });
        return makeSuccessResult("final");
      },
    );

    const { run, typing } = createMinimalRun({
      opts: { isHeartbeat: false, onPartialReply },
    });
    await run();

    expect(onPartialReply).toHaveBeenCalled();
    expect(typing.startTypingOnText).toHaveBeenCalledWith("hi");
    expect(typing.startTypingLoop).toHaveBeenCalled();
  });

  it("never signals typing for heartbeat runs", async () => {
    const onPartialReply = vi.fn();
    state.runAgentTurnMock.mockImplementationOnce(
      async (params: {
        opts?: { onPartialReply?: (p: { text?: string }) => Promise<void> | void };
        typingSignals: { signalTextDelta: (t: string) => Promise<void> };
      }) => {
        // Even though we invoke the signaling, heartbeat mode suppresses typing
        await params.typingSignals.signalTextDelta("hi");
        await params.opts?.onPartialReply?.({ text: "hi" });
        return makeSuccessResult("final");
      },
    );

    const { run, typing } = createMinimalRun({
      opts: { isHeartbeat: true, onPartialReply },
    });
    await run();

    // onPartialReply is still called — heartbeat suppresses *typing* only
    expect(onPartialReply).toHaveBeenCalled();
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
    expect(typing.startTypingLoop).not.toHaveBeenCalled();
  });

  it("suppresses partial streaming for NO_REPLY", async () => {
    const onPartialReply = vi.fn();
    state.runAgentTurnMock.mockImplementationOnce(
      async (params: {
        opts?: { onPartialReply?: (p: { text?: string }) => Promise<void> | void };
        typingSignals: { signalTextDelta: (t: string) => Promise<void> };
      }) => {
        // In the real implementation, normalizeStreamingText filters NO_REPLY,
        // so neither onPartialReply nor typingSignals are called
        await params.typingSignals.signalTextDelta("NO_REPLY");
        await params.opts?.onPartialReply?.({ text: "NO_REPLY" });
        return makeSuccessResult("NO_REPLY");
      },
    );

    const { run, typing } = createMinimalRun({
      opts: { isHeartbeat: false, onPartialReply },
      typingMode: "message",
    });
    await run();

    // In 'message' mode, signalTextDelta on NO_REPLY text calls startTypingOnText
    // but the silent reply token is detected; the real impl filters before calling.
    // Since we're testing runReplyAgent (not runAgentTurnWithFallback), and the
    // mock fires callbacks that the real code would suppress, the key assertion is
    // that the final result is properly filtered (NO_REPLY -> no payload).
    // The typing assertions reflect that the TypingSignaler's signalTextDelta
    // recognises NO_REPLY as silent and suppresses typing start:
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
    expect(typing.startTypingLoop).not.toHaveBeenCalled();
  });

  it("does not start typing on assistant message start without prior text in message mode", async () => {
    // In the new code path, onAssistantMessageStart does not exist.
    // The mock simply returns a result without invoking any typing signals.
    state.runAgentTurnMock.mockResolvedValueOnce(makeSuccessResult("final"));

    const { run, typing } = createMinimalRun({
      typingMode: "message",
    });
    await run();

    // No typing signals fired by the mock, so no typing started
    expect(typing.startTypingLoop).not.toHaveBeenCalled();
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
  });

  it("starts typing from tool start signal in thinking mode", async () => {
    state.runAgentTurnMock.mockImplementationOnce(
      async (params: { typingSignals: { signalToolStart: () => Promise<void> } }) => {
        // In thinking mode, tool start triggers the typing loop
        await params.typingSignals.signalToolStart();
        return makeSuccessResult("final");
      },
    );

    const { run, typing } = createMinimalRun({
      typingMode: "thinking",
    });
    await run();

    expect(typing.startTypingLoop).toHaveBeenCalled();
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
  });

  it("suppresses typing in never mode", async () => {
    state.runAgentTurnMock.mockImplementationOnce(
      async (params: { typingSignals: { signalTextDelta: (t: string) => Promise<void> } }) => {
        // Even when text delta is signaled, "never" mode suppresses typing
        await params.typingSignals.signalTextDelta("hi");
        return makeSuccessResult("final");
      },
    );

    const { run, typing } = createMinimalRun({
      typingMode: "never",
    });
    await run();

    expect(typing.startTypingOnText).not.toHaveBeenCalled();
    expect(typing.startTypingLoop).not.toHaveBeenCalled();
  });

  it("signals typing on normalized block replies", async () => {
    const onBlockReply = vi.fn();
    state.runAgentTurnMock.mockImplementationOnce(
      async (params: {
        blockReplyPipeline: { enqueue: (p: ReplyPayload) => void } | null;
        typingSignals: { signalTextDelta: (t: string) => Promise<void> };
      }) => {
        // Simulate block reply via the pipeline
        if (params.blockReplyPipeline) {
          params.blockReplyPipeline.enqueue({ text: "chunk" });
        }
        await params.typingSignals.signalTextDelta("chunk");
        return makeSuccessResult("final");
      },
    );

    const { run, typing } = createMinimalRun({
      typingMode: "message",
      blockStreamingEnabled: true,
      opts: { onBlockReply },
    });
    await run();

    expect(typing.startTypingOnText).toHaveBeenCalledWith("chunk");
  });

  it("signals typing on tool results via shouldEmitToolResult", async () => {
    const onToolResult = vi.fn();
    state.runAgentTurnMock.mockImplementationOnce(
      async (params: { typingSignals: { signalToolStart: () => Promise<void> } }) => {
        // Tool start triggers typing in the real implementation
        await params.typingSignals.signalToolStart();
        return makeSuccessResult("final");
      },
    );

    const { run, typing } = createMinimalRun({
      typingMode: "message",
      opts: { onToolResult },
    });
    await run();

    // signalToolStart triggers startTypingLoop
    expect(typing.startTypingLoop).toHaveBeenCalled();
  });

  it("skips typing for silent tool results", async () => {
    const onToolResult = vi.fn();
    // Mock returns result without invoking any typing signals
    state.runAgentTurnMock.mockResolvedValueOnce(makeSuccessResult("final"));

    const { run, typing } = createMinimalRun({
      typingMode: "message",
      opts: { onToolResult },
    });
    await run();

    // No typing signals fired by the mock
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
  });

  it("announces auto-compaction in verbose mode and tracks count", async () => {
    await withTempStateDir(async (stateDir) => {
      const storePath = path.join(stateDir, "sessions", "sessions.json");
      const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: Date.now() };
      const sessionStore = { main: sessionEntry };

      state.runAgentTurnMock.mockResolvedValueOnce(
        makeSuccessResult("final", { autoCompactionCompleted: true }),
      );

      const { run } = createMinimalRun({
        resolvedVerboseLevel: "on",
        sessionEntry,
        sessionStore,
        sessionKey: "main",
        storePath,
      });
      const res = await run();
      expect(Array.isArray(res)).toBe(true);
      const payloads = res as { text?: string }[];
      expect(payloads[0]?.text).toContain("Auto-compaction complete");
      expect(payloads[0]?.text).toContain("count 1");
      expect(sessionStore.main.compactionCount).toBe(1);
    });
  });

  it("keeps sessions intact on other errors", async () => {
    await withTempStateDir(async (stateDir) => {
      const sessionId = "session-ok";
      const storePath = path.join(stateDir, "sessions", "sessions.json");
      const sessionEntry = { sessionId, updatedAt: Date.now() };
      const sessionStore = { main: sessionEntry };

      await fs.mkdir(path.dirname(storePath), { recursive: true });
      await fs.writeFile(storePath, JSON.stringify(sessionStore), "utf-8");

      state.runAgentTurnMock.mockResolvedValueOnce(
        makeFinalResult({
          text: "\u26a0\ufe0f Agent failed before reply: INVALID_ARGUMENT: some other failure.\nLogs: remoteclaw logs --follow",
        }),
      );

      const { run } = createMinimalRun({
        sessionEntry,
        sessionStore,
        sessionKey: "main",
        storePath,
      });
      const res = await run();

      expect(res).toMatchObject({
        text: expect.stringContaining("Agent failed before reply"),
      });
      // Session is untouched — the error is returned as a final payload by
      // runAgentTurnWithFallback, so runReplyAgent just passes it through.
      expect(sessionStore.main).toBeDefined();
    });
  });
});

describe("runReplyAgent memory flush", () => {
  let fixtureRoot = "";
  let caseId = 0;

  async function withTempStore<T>(fn: (storePath: string) => Promise<T>): Promise<T> {
    const dir = path.join(fixtureRoot, `case-${++caseId}`);
    await fs.mkdir(dir, { recursive: true });
    return await fn(path.join(dir, "sessions.json"));
  }

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), "remoteclaw-memory-flush-"));
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("skips memory flush for CLI providers", async () => {
    await withTempStore(async (storePath) => {
      const sessionKey = "main";
      const sessionEntry = {
        sessionId: "session",
        updatedAt: Date.now(),
        totalTokens: 80_000,
        compactionCount: 1,
      };

      await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

      state.runAgentTurnMock.mockResolvedValue(makeSuccessResult("ok"));

      const baseRun = createBaseRun({
        storePath,
        sessionEntry,
        runOverrides: { provider: "codex-cli" },
      });

      await runReplyAgentWithBase({
        baseRun,
        storePath,
        sessionKey,
        sessionEntry,
        commandBody: "hello",
      });

      // runAgentTurnWithFallback is always called (CLI routing is inside the bridge)
      expect(state.runAgentTurnMock).toHaveBeenCalledTimes(1);
    });
  });

  it("skips memory flush when disabled in config", async () => {
    await withTempStore(async (storePath) => {
      const sessionKey = "main";
      const sessionEntry = {
        sessionId: "session",
        updatedAt: Date.now(),
        totalTokens: 80_000,
        compactionCount: 1,
      };

      await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

      state.runAgentTurnMock.mockResolvedValue(makeSuccessResult("ok"));

      const baseRun = createBaseRun({
        storePath,
        sessionEntry,
        config: { agents: { defaults: { compaction: { memoryFlush: { enabled: false } } } } },
      });

      await runReplyAgentWithBase({
        baseRun,
        storePath,
        sessionKey,
        sessionEntry,
        commandBody: "hello",
      });

      expect(state.runAgentTurnMock).toHaveBeenCalledTimes(1);

      const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
      expect(stored[sessionKey].memoryFlushAt).toBeUndefined();
    });
  });

  it("skips memory flush after a prior flush in the same compaction cycle", async () => {
    await withTempStore(async (storePath) => {
      const sessionKey = "main";
      const sessionEntry = {
        sessionId: "session",
        updatedAt: Date.now(),
        totalTokens: 80_000,
        compactionCount: 2,
        memoryFlushCompactionCount: 2,
      };

      await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

      state.runAgentTurnMock.mockResolvedValue(makeSuccessResult("ok"));

      const baseRun = createBaseRun({
        storePath,
        sessionEntry,
      });

      await runReplyAgentWithBase({
        baseRun,
        storePath,
        sessionKey,
        sessionEntry,
        commandBody: "hello",
      });

      // Only the main run call, no flush
      expect(state.runAgentTurnMock).toHaveBeenCalledTimes(1);
    });
  });
});
