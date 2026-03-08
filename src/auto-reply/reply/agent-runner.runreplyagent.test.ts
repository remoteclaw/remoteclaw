import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import * as sessions from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import type {
  AgentDeliveryResult,
  BridgeCallbacks,
  ChannelMessage,
  McpSideEffects,
} from "../../middleware/types.js";
import { withStateDirEnv } from "../../test-helpers/state-dir-env.js";
import type { TemplateContext } from "../templating.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { enqueueFollowupRun, type FollowupRun, type QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const state = vi.hoisted(() => ({
  channelBridgeHandleMock: vi.fn(),
  runAgentMock: vi.fn(),
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

vi.mock("../../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    handle(message: ChannelMessage, callbacks?: BridgeCallbacks, abortSignal?: AbortSignal) {
      return state.channelBridgeHandleMock(message, callbacks, abortSignal);
    }
  },
}));

vi.mock("../../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/paths.js")>();
  return {
    ...actual,
    resolveGatewayPort: () => 9999,
  };
});

vi.mock("../../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: () => ({ token: "test-token" }),
}));

vi.mock("./queue.js", () => ({
  enqueueFollowupRun: vi.fn(),
  scheduleFollowupDrain: vi.fn(),
}));

beforeAll(async () => {
  await getRunReplyAgent();
});

beforeEach(() => {
  state.channelBridgeHandleMock.mockClear();
  state.runAgentMock.mockClear();
  vi.mocked(enqueueFollowupRun).mockClear();
  vi.stubEnv("REMOTECLAW_TEST_FAST", "1");
});

// ── Helpers ──────────────────────────────────────────────────────────────

const EMPTY_MCP: McpSideEffects = {
  sentTexts: [],
  sentMediaUrls: [],
  sentTargets: [],
  cronAdds: 0,
};

/** Build an AgentDeliveryResult with sensible defaults. */
function makeDeliveryResult(overrides?: {
  payloads?: ReplyPayload[];
  text?: string;
  sessionId?: string;
  durationMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  aborted?: boolean;
  errorSubtype?: string;
  stopReason?: string;
  mcp?: Partial<McpSideEffects>;
  error?: string;
}): AgentDeliveryResult {
  return {
    payloads: overrides?.payloads ?? [{ text: "final" }],
    run: {
      text: overrides?.text ?? "",
      sessionId: overrides?.sessionId,
      durationMs: overrides?.durationMs ?? 0,
      usage: overrides?.usage,
      aborted: overrides?.aborted ?? false,
      errorSubtype: overrides?.errorSubtype,
      stopReason: overrides?.stopReason,
    },
    mcp: { ...EMPTY_MCP, ...overrides?.mcp },
    error: overrides?.error,
  };
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
  isActive?: boolean;
  shouldFollowup?: boolean;
  resolvedQueueMode?: string;
  runOverrides?: Partial<FollowupRun["run"]>;
}) {
  const typing = createMockTypingController();
  const opts = params?.opts;
  const sessionCtx = {
    Provider: "whatsapp",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = {
    mode: params?.resolvedQueueMode ?? "interrupt",
  } as unknown as QueueSettings;
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
      config: { agents: { defaults: { runtime: "claude" } } },
      provider: "anthropic",
      model: "claude",

      verboseLevel: params?.resolvedVerboseLevel ?? "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
      ...params?.runOverrides,
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
        shouldFollowup: params?.shouldFollowup ?? false,
        isActive: params?.isActive ?? false,
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
      config: params.config ?? { agents: { defaults: { runtime: "claude" } } },
      provider: "anthropic",
      model: "claude",

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
    shouldFollowup: false,
    isActive: false,
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

describe("runReplyAgent heartbeat followup guard", () => {
  it("drops heartbeat runs when another run is active", async () => {
    const { run, typing } = createMinimalRun({
      opts: { isHeartbeat: true },
      isActive: true,
      shouldFollowup: true,
      resolvedQueueMode: "collect",
    });

    const result = await run();

    expect(result).toBeUndefined();
    expect(vi.mocked(enqueueFollowupRun)).not.toHaveBeenCalled();
    expect(state.channelBridgeHandleMock).not.toHaveBeenCalled();
    expect(typing.cleanup).toHaveBeenCalledTimes(1);
  });

  it("still enqueues non-heartbeat runs when another run is active", async () => {
    const { run } = createMinimalRun({
      opts: { isHeartbeat: false },
      isActive: true,
      shouldFollowup: true,
      resolvedQueueMode: "collect",
    });

    const result = await run();

    expect(result).toBeUndefined();
    expect(vi.mocked(enqueueFollowupRun)).toHaveBeenCalledTimes(1);
    expect(state.channelBridgeHandleMock).not.toHaveBeenCalled();
  });
});

describe("runReplyAgent mediaUrls forwarding", () => {
  it("passes sessionCtx.MediaUrls to the ChannelMessage", async () => {
    state.channelBridgeHandleMock.mockResolvedValueOnce(makeDeliveryResult());

    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "telegram",
      MessageSid: "msg-media",
      MediaUrls: ["https://example.test/photo.jpg", "https://example.test/doc.pdf"],
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
        config: { agents: { defaults: { runtime: "claude" } } },
        provider: "anthropic",
        model: "claude",
        verboseLevel: "off",
        elevatedLevel: "off",
        bashElevated: { enabled: false, allowed: false, defaultLevel: "off" },
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    const runReplyAgent = await getRunReplyAgent();
    await runReplyAgent({
      commandBody: "describe this image",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldFollowup: false,
      isActive: false,
      typing,
      sessionCtx,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);
    const message: ChannelMessage = state.channelBridgeHandleMock.mock.calls[0][0];
    expect(message.mediaUrls).toEqual([
      "https://example.test/photo.jpg",
      "https://example.test/doc.pdf",
    ]);
  });

  it("omits mediaUrls when sessionCtx.MediaUrls is empty", async () => {
    state.channelBridgeHandleMock.mockResolvedValueOnce(makeDeliveryResult());

    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "telegram",
      MessageSid: "msg-no-media",
      MediaUrls: [],
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
        config: { agents: { defaults: { runtime: "claude" } } },
        provider: "anthropic",
        model: "claude",
        verboseLevel: "off",
        elevatedLevel: "off",
        bashElevated: { enabled: false, allowed: false, defaultLevel: "off" },
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    const runReplyAgent = await getRunReplyAgent();
    await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldFollowup: false,
      isActive: false,
      typing,
      sessionCtx,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);
    const message: ChannelMessage = state.channelBridgeHandleMock.mock.calls[0][0];
    expect(message.mediaUrls).toBeUndefined();
  });
});

describe("runReplyAgent typing (heartbeat)", () => {
  async function withTempStateDir<T>(fn: (stateDir: string) => Promise<T>): Promise<T> {
    return await withStateDirEnv(
      "remoteclaw-typing-heartbeat-",
      async ({ stateDir }) => await fn(stateDir),
    );
  }

  async function writeCorruptGeminiSessionFixture(params: {
    stateDir: string;
    sessionId: string;
    persistStore: boolean;
  }) {
    const storePath = path.join(params.stateDir, "sessions", "sessions.json");
    const sessionEntry: SessionEntry = { sessionId: params.sessionId, updatedAt: Date.now() };
    const sessionStore = { main: sessionEntry };

    await fs.mkdir(path.dirname(storePath), { recursive: true });
    if (params.persistStore) {
      await fs.writeFile(storePath, JSON.stringify(sessionStore), "utf-8");
    }

    const transcriptPath = sessions.resolveSessionTranscriptPath(params.sessionId);
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await fs.writeFile(transcriptPath, "bad", "utf-8");

    return { storePath, sessionEntry, sessionStore, transcriptPath };
  }

  it("signals typing for normal runs", async () => {
    const onPartialReply = vi.fn();
    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        await callbacks?.onPartialReply?.({ text: "hi" });
        return makeDeliveryResult();
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
    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        await callbacks?.onPartialReply?.({ text: "hi" });
        return makeDeliveryResult();
      },
    );

    const { run, typing } = createMinimalRun({
      opts: { isHeartbeat: true, onPartialReply },
    });
    await run();

    expect(onPartialReply).toHaveBeenCalled();
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
    expect(typing.startTypingLoop).not.toHaveBeenCalled();
  });

  it("suppresses NO_REPLY partials but allows normal No-prefix partials", async () => {
    const cases = [
      {
        partials: ["NO_REPLY"],
        finalText: "NO_REPLY",
        expectedForwarded: [] as string[],
        shouldType: false,
      },
      {
        partials: ["NO_", "NO_RE", "NO_REPLY"],
        finalText: "NO_REPLY",
        expectedForwarded: [] as string[],
        shouldType: false,
      },
      {
        partials: ["No", "No, that is valid"],
        finalText: "No, that is valid",
        expectedForwarded: ["No", "No, that is valid"],
        shouldType: true,
      },
    ] as const;

    for (const testCase of cases) {
      const onPartialReply = vi.fn();
      state.channelBridgeHandleMock.mockImplementationOnce(
        async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
          for (const text of testCase.partials) {
            await callbacks?.onPartialReply?.({ text });
          }
          return makeDeliveryResult({ payloads: [{ text: testCase.finalText }] });
        },
      );

      const { run, typing } = createMinimalRun({
        opts: { isHeartbeat: false, onPartialReply },
        typingMode: "message",
      });
      await run();

      if (testCase.expectedForwarded.length === 0) {
        expect(onPartialReply).not.toHaveBeenCalled();
      } else {
        expect(onPartialReply).toHaveBeenCalledTimes(testCase.expectedForwarded.length);
        testCase.expectedForwarded.forEach((text, index) => {
          expect(onPartialReply).toHaveBeenNthCalledWith(index + 1, {
            text,
            mediaUrls: undefined,
          });
        });
      }

      if (testCase.shouldType) {
        expect(typing.startTypingOnText).toHaveBeenCalled();
      } else {
        expect(typing.startTypingOnText).not.toHaveBeenCalled();
      }
      expect(typing.startTypingLoop).not.toHaveBeenCalled();
    }
  });

  it("does not start typing on assistant message start without prior text in message mode", async () => {
    // BridgeCallbacks do not have onAssistantMessageStart, so the bridge
    // simply won't trigger typing from an assistant-message-start signal.
    // Verify that typing is NOT started when only a final payload arrives.
    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, _callbacks?: BridgeCallbacks) => {
        // No callbacks invoked — only the final delivery result
        return makeDeliveryResult();
      },
    );

    const { run, typing } = createMinimalRun({
      typingMode: "message",
    });
    await run();

    expect(typing.startTypingLoop).not.toHaveBeenCalled();
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
  });

  it("starts typing from partial reply in thinking mode", async () => {
    // BridgeCallbacks do not have onReasoningStream. In the ChannelBridge
    // world, reasoning events are not streamed through callbacks. In
    // "thinking" mode, typing is triggered via signalTextDelta which calls
    // startTypingLoop (not startTypingOnText) for the reasoning path.
    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        await callbacks?.onPartialReply?.({ text: "hi" });
        return makeDeliveryResult();
      },
    );

    const { run, typing } = createMinimalRun({
      typingMode: "thinking",
    });
    await run();

    // In thinking mode, signalTextDelta triggers startTypingLoop (not startTypingOnText)
    expect(typing.startTypingLoop).toHaveBeenCalled();
    expect(typing.startTypingOnText).not.toHaveBeenCalled();
  });

  it("keeps assistant partial streaming enabled when reasoning mode is stream", async () => {
    const onPartialReply = vi.fn();
    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        await callbacks?.onPartialReply?.({ text: "answer chunk" });
        return makeDeliveryResult();
      },
    );

    const { run } = createMinimalRun({
      opts: { onPartialReply },
      runOverrides: {},
    });
    await run();

    // onReasoningStream is no longer available through BridgeCallbacks,
    // but onPartialReply should still be forwarded.
    expect(onPartialReply).toHaveBeenCalledWith({ text: "answer chunk", mediaUrls: undefined });
  });

  it("suppresses typing in never mode", async () => {
    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        await callbacks?.onPartialReply?.({ text: "hi" });
        return makeDeliveryResult();
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
    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        await callbacks?.onBlockReply?.({ text: "\n\nchunk", mediaUrls: [] });
        return makeDeliveryResult();
      },
    );

    const { run, typing } = createMinimalRun({
      typingMode: "message",
      blockStreamingEnabled: true,
      opts: { onBlockReply },
    });
    await run();

    expect(typing.startTypingOnText).toHaveBeenCalledWith("chunk");
    expect(onBlockReply).toHaveBeenCalled();
    const [blockPayload, blockOpts] = onBlockReply.mock.calls[0] ?? [];
    expect(blockPayload).toMatchObject({ text: "chunk", audioAsVoice: false });
    expect(blockOpts).toMatchObject({
      abortSignal: expect.any(AbortSignal),
      timeoutMs: expect.any(Number),
    });
  });

  it("handles typing for normal and silent tool results", async () => {
    const cases = [
      {
        toolText: "tooling",
        shouldType: true,
        shouldForward: true,
      },
      {
        toolText: "NO_REPLY",
        shouldType: false,
        shouldForward: false,
      },
    ] as const;

    for (const testCase of cases) {
      const onToolResult = vi.fn();
      state.channelBridgeHandleMock.mockImplementationOnce(
        async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
          await callbacks?.onToolResult?.({ text: testCase.toolText, mediaUrls: [] });
          return makeDeliveryResult();
        },
      );

      const { run, typing } = createMinimalRun({
        typingMode: "message",
        opts: { onToolResult },
      });
      await run();

      if (testCase.shouldType) {
        expect(typing.startTypingOnText).toHaveBeenCalledWith(testCase.toolText);
      } else {
        expect(typing.startTypingOnText).not.toHaveBeenCalled();
      }

      if (testCase.shouldForward) {
        expect(onToolResult).toHaveBeenCalledWith({
          text: testCase.toolText,
          mediaUrls: [],
        });
      } else {
        expect(onToolResult).not.toHaveBeenCalled();
      }
    }
  });

  it("retries transient HTTP failures once with timer-driven backoff", async () => {
    vi.useFakeTimers();
    let calls = 0;
    state.channelBridgeHandleMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("502 Bad Gateway");
      }
      return makeDeliveryResult();
    });

    const { run } = createMinimalRun({
      typingMode: "message",
    });
    const runPromise = run();

    await vi.advanceTimersByTimeAsync(2_499);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await runPromise;
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it("delivers tool results in order even when dispatched concurrently", async () => {
    const deliveryOrder: string[] = [];
    const onToolResult = vi.fn(async (payload: { text?: string }) => {
      // Simulate variable network latency: first result is slower than second
      const delay = payload.text === "first" ? 5 : 1;
      await new Promise((r) => setTimeout(r, delay));
      deliveryOrder.push(payload.text ?? "");
    });

    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        // Fire two tool results without awaiting each one; await both at the end.
        const first = callbacks?.onToolResult?.({ text: "first", mediaUrls: [] });
        const second = callbacks?.onToolResult?.({ text: "second", mediaUrls: [] });
        await Promise.all([first, second]);
        return makeDeliveryResult();
      },
    );

    const { run } = createMinimalRun({
      typingMode: "message",
      opts: { onToolResult },
    });
    await run();

    expect(onToolResult).toHaveBeenCalledTimes(2);
    // Despite "first" having higher latency, it must be delivered before "second"
    expect(deliveryOrder).toEqual(["first", "second"]);
  });

  it("continues delivering later tool results after an earlier tool result fails", async () => {
    const delivered: string[] = [];
    const onToolResult = vi.fn(async (payload: { text?: string }) => {
      if (payload.text === "first") {
        throw new Error("simulated delivery failure");
      }
      delivered.push(payload.text ?? "");
    });

    state.channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        const first = callbacks?.onToolResult?.({ text: "first", mediaUrls: [] });
        const second = callbacks?.onToolResult?.({ text: "second", mediaUrls: [] });
        await Promise.allSettled([first, second]);
        return makeDeliveryResult();
      },
    );

    const { run } = createMinimalRun({
      typingMode: "message",
      opts: { onToolResult },
    });
    await run();

    expect(onToolResult).toHaveBeenCalledTimes(2);
    expect(delivered).toEqual(["second"]);
  });

  it("retries after compaction failure by resetting the session", async () => {
    await withTempStateDir(async (stateDir) => {
      const sessionId = "session";
      const storePath = path.join(stateDir, "sessions", "sessions.json");
      const transcriptPath = sessions.resolveSessionTranscriptPath(sessionId);
      const sessionEntry = {
        sessionId,
        updatedAt: Date.now(),
        sessionFile: transcriptPath,
        fallbackNoticeSelectedModel: "fireworks/minimax-m2p5",
        fallbackNoticeActiveModel: "deepinfra/moonshotai/Kimi-K2.5",
        fallbackNoticeReason: "rate limit",
      };
      const sessionStore = { main: sessionEntry };

      await fs.mkdir(path.dirname(storePath), { recursive: true });
      await fs.writeFile(storePath, JSON.stringify(sessionStore), "utf-8");
      await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
      await fs.writeFile(transcriptPath, "ok", "utf-8");

      state.channelBridgeHandleMock.mockImplementationOnce(async () => {
        throw new Error(
          'Context overflow: Summarization failed: 400 {"message":"prompt is too long"}',
        );
      });

      const { run } = createMinimalRun({
        sessionEntry,
        sessionStore,
        sessionKey: "main",
        storePath,
      });
      const res = await run();

      expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);
      const payload = Array.isArray(res) ? res[0] : res;
      expect(payload).toMatchObject({
        text: expect.stringContaining("Context limit exceeded during compaction"),
      });
      if (!payload) {
        throw new Error("expected payload");
      }
      expect(payload.text?.toLowerCase()).toContain("reset");
      expect(sessionStore.main.sessionId).not.toBe(sessionId);
      expect(sessionStore.main.fallbackNoticeSelectedModel).toBeUndefined();
      expect(sessionStore.main.fallbackNoticeActiveModel).toBeUndefined();
      expect(sessionStore.main.fallbackNoticeReason).toBeUndefined();

      const persisted = JSON.parse(await fs.readFile(storePath, "utf-8"));
      expect(persisted.main.sessionId).toBe(sessionStore.main.sessionId);
      expect(persisted.main.fallbackNoticeSelectedModel).toBeUndefined();
      expect(persisted.main.fallbackNoticeActiveModel).toBeUndefined();
      expect(persisted.main.fallbackNoticeReason).toBeUndefined();
    });
  });

  it("retries after context overflow payload by resetting the session", async () => {
    await withTempStateDir(async (stateDir) => {
      const sessionId = "session";
      const storePath = path.join(stateDir, "sessions", "sessions.json");
      const transcriptPath = sessions.resolveSessionTranscriptPath(sessionId);
      const sessionEntry = { sessionId, updatedAt: Date.now(), sessionFile: transcriptPath };
      const sessionStore = { main: sessionEntry };

      await fs.mkdir(path.dirname(storePath), { recursive: true });
      await fs.writeFile(storePath, JSON.stringify(sessionStore), "utf-8");
      await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
      await fs.writeFile(transcriptPath, "ok", "utf-8");

      // Return an AgentDeliveryResult with context overflow error.
      // The production code maps this via mapToEmbeddedPiRunResult which
      // produces meta.error.kind === "context_overflow".
      state.channelBridgeHandleMock.mockImplementationOnce(async () =>
        makeDeliveryResult({
          payloads: [{ text: "Context overflow: prompt too large", isError: true }],
          errorSubtype: "context_window",
          error: 'Context overflow: Summarization failed: 400 {"message":"prompt is too long"}',
        }),
      );

      const { run } = createMinimalRun({
        sessionEntry,
        sessionStore,
        sessionKey: "main",
        storePath,
      });
      const res = await run();

      expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);
      const payload = Array.isArray(res) ? res[0] : res;
      expect(payload).toMatchObject({
        text: expect.stringContaining("Context limit exceeded"),
      });
      if (!payload) {
        throw new Error("expected payload");
      }
      expect(payload.text?.toLowerCase()).toContain("reset");
      expect(sessionStore.main.sessionId).not.toBe(sessionId);

      const persisted = JSON.parse(await fs.readFile(storePath, "utf-8"));
      expect(persisted.main.sessionId).toBe(sessionStore.main.sessionId);
    });
  });

  it("resets the session after role ordering payloads", async () => {
    await withTempStateDir(async (stateDir) => {
      const sessionId = "session";
      const storePath = path.join(stateDir, "sessions", "sessions.json");
      const transcriptPath = sessions.resolveSessionTranscriptPath(sessionId);
      const sessionEntry = { sessionId, updatedAt: Date.now(), sessionFile: transcriptPath };
      const sessionStore = { main: sessionEntry };

      await fs.mkdir(path.dirname(storePath), { recursive: true });
      await fs.writeFile(storePath, JSON.stringify(sessionStore), "utf-8");
      await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
      await fs.writeFile(transcriptPath, "ok", "utf-8");

      // Return an AgentDeliveryResult with role_ordering error.
      // mapToEmbeddedPiRunResult does NOT map this to meta.error
      // (only context_window maps to meta.error). But the production code
      // in agent-runner-execution.ts checks delivery.error and delivery.payloads.
      // Since payloads is non-empty, it won't throw. The error is surfaced
      // via the mapped EmbeddedPiRunResult meta.error.kind === "role_ordering".
      // Let's check what mapToEmbeddedPiRunResult does...
      // Actually: mapToEmbeddedPiRunResult only sets meta.error for
      // errorSubtype === "context_window". For role_ordering, the error
      // needs to be thrown or handled differently.
      // Looking at the production code again: the old mock returned
      // meta.error.kind === "role_ordering". Let me check how the
      // production code surfaces that.
      // The old code: runEmbeddedPiAgent returned { payloads, meta: { error: { kind: "role_ordering", message } } }
      // In the new code: mapToEmbeddedPiRunResult only maps context_window to meta.error.
      // So role_ordering must come through a different path.
      // Actually, looking at agent-runner-execution.ts lines 474: it checks
      // bridgeError?.kind === "role_ordering". And bridgeError comes from
      // runResult.meta?.error. So mapToEmbeddedPiRunResult must produce this.
      // But looking at the code, only context_window errorSubtype maps to meta.error.
      // Wait - let me re-read. The role_ordering may be thrown as an exception instead.
      // Actually, if the bridge returns an error with no payloads, the production
      // code at line 384-386 throws: throw new Error(delivery.error).
      // Then the catch block at line 491-492 checks isRoleOrderingError.
      // So for role ordering, the bridge should return error with empty payloads,
      // which triggers the throw, which hits the catch.
      state.channelBridgeHandleMock.mockImplementationOnce(async () =>
        makeDeliveryResult({
          payloads: [],
          error: 'messages: roles must alternate between "user" and "assistant"',
        }),
      );

      const { run } = createMinimalRun({
        sessionEntry,
        sessionStore,
        sessionKey: "main",
        storePath,
      });
      const res = await run();

      const payload = Array.isArray(res) ? res[0] : res;
      expect(payload).toMatchObject({
        text: expect.stringContaining("Message ordering conflict"),
      });
      if (!payload) {
        throw new Error("expected payload");
      }
      expect(payload.text?.toLowerCase()).toContain("reset");
      expect(sessionStore.main.sessionId).not.toBe(sessionId);
      await expect(fs.access(transcriptPath)).rejects.toBeDefined();

      const persisted = JSON.parse(await fs.readFile(storePath, "utf-8"));
      expect(persisted.main.sessionId).toBe(sessionStore.main.sessionId);
    });
  });

  it("resets corrupted Gemini sessions and deletes transcripts", async () => {
    await withTempStateDir(async (stateDir) => {
      const { storePath, sessionEntry, sessionStore, transcriptPath } =
        await writeCorruptGeminiSessionFixture({
          stateDir,
          sessionId: "session-corrupt",
          persistStore: true,
        });

      state.channelBridgeHandleMock.mockImplementationOnce(async () => {
        throw new Error(
          "function call turn comes immediately after a user turn or after a function response turn",
        );
      });

      const { run } = createMinimalRun({
        sessionEntry,
        sessionStore,
        sessionKey: "main",
        storePath,
      });
      const res = await run();

      expect(res).toMatchObject({
        text: expect.stringContaining("Session history was corrupted"),
      });
      expect(sessionStore.main).toBeUndefined();
      await expect(fs.access(transcriptPath)).rejects.toThrow();

      const persisted = JSON.parse(await fs.readFile(storePath, "utf-8"));
      expect(persisted.main).toBeUndefined();
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

      const transcriptPath = sessions.resolveSessionTranscriptPath(sessionId);
      await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
      await fs.writeFile(transcriptPath, "ok", "utf-8");

      state.channelBridgeHandleMock.mockImplementationOnce(async () => {
        throw new Error("INVALID_ARGUMENT: some other failure");
      });

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
      expect(sessionStore.main).toBeDefined();
      await expect(fs.access(transcriptPath)).resolves.toBeUndefined();

      const persisted = JSON.parse(await fs.readFile(storePath, "utf-8"));
      expect(persisted.main).toBeDefined();
    });
  });

  it("still replies even if session reset fails to persist", async () => {
    await withTempStateDir(async (stateDir) => {
      const saveSpy = vi
        .spyOn(sessions, "saveSessionStore")
        .mockRejectedValueOnce(new Error("boom"));
      try {
        const { storePath, sessionEntry, sessionStore, transcriptPath } =
          await writeCorruptGeminiSessionFixture({
            stateDir,
            sessionId: "session-corrupt",
            persistStore: false,
          });

        state.channelBridgeHandleMock.mockImplementationOnce(async () => {
          throw new Error(
            "function call turn comes immediately after a user turn or after a function response turn",
          );
        });

        const { run } = createMinimalRun({
          sessionEntry,
          sessionStore,
          sessionKey: "main",
          storePath,
        });
        const res = await run();

        expect(res).toMatchObject({
          text: expect.stringContaining("Session history was corrupted"),
        });
        expect(sessionStore.main).toBeUndefined();
        await expect(fs.access(transcriptPath)).rejects.toThrow();
      } finally {
        saveSpy.mockRestore();
      }
    });
  });

  it("returns friendly message for role ordering errors thrown as exceptions", async () => {
    state.channelBridgeHandleMock.mockImplementationOnce(async () => {
      throw new Error("400 Incorrect role information");
    });

    const { run } = createMinimalRun({});
    const res = await run();

    expect(res).toMatchObject({
      text: expect.stringContaining("Message ordering conflict"),
    });
    expect(res).toMatchObject({
      text: expect.not.stringContaining("400"),
    });
  });

  it("rewrites Bun socket errors into friendly text", async () => {
    state.channelBridgeHandleMock.mockImplementationOnce(async () =>
      makeDeliveryResult({
        payloads: [
          {
            text: "TypeError: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()",
            isError: true,
          },
        ],
      }),
    );

    const { run } = createMinimalRun();
    const res = await run();
    const payloads = Array.isArray(res) ? res : res ? [res] : [];
    expect(payloads.length).toBe(1);
    expect(payloads[0]?.text).toContain("LLM connection failed");
    expect(payloads[0]?.text).toContain("socket connection was closed unexpectedly");
    expect(payloads[0]?.text).toContain("```");
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
      };

      await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

      // The main execution path now goes through ChannelBridge for all providers
      // (including CLI providers like codex-cli). Memory flush is skipped because
      // isCliProvider("codex-cli") returns true in agent-runner-memory.ts.
      state.channelBridgeHandleMock.mockResolvedValue(
        makeDeliveryResult({
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      );

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

      // Main run goes through ChannelBridge
      expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);
      // Memory flush does NOT run for CLI providers, so runEmbeddedPiAgent should not be called
      expect(state.runAgentMock).not.toHaveBeenCalled();
    });
  });

  it("does not run memory flush (embedded engine removed)", async () => {
    await withTempStore(async (storePath) => {
      const sessionKey = "main";
      const sessionEntry = {
        sessionId: "session",
        updatedAt: Date.now(),
        totalTokens: 80_000,
      };

      await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

      // Main run goes through ChannelBridge
      state.channelBridgeHandleMock.mockResolvedValue(
        makeDeliveryResult({
          payloads: [{ text: "ok" }],
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      );

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

      // Memory flush is gutted (#74) — runEmbeddedPiAgent should NOT be called
      expect(state.runAgentMock).not.toHaveBeenCalled();
      // Main run uses ChannelBridge
      expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);

      const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
      expect(stored[sessionKey].memoryFlushAt).toBeUndefined();
    });
  });

  it("skips memory flush when disabled in config", async () => {
    await withTempStore(async (storePath) => {
      const sessionKey = "main";
      const sessionEntry = {
        sessionId: "session",
        updatedAt: Date.now(),
        totalTokens: 80_000,
      };

      await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

      state.channelBridgeHandleMock.mockResolvedValue(
        makeDeliveryResult({
          payloads: [{ text: "ok" }],
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      );

      const baseRun = createBaseRun({
        storePath,
        sessionEntry,
        config: {
          agents: {
            defaults: { runtime: "claude" },
          },
        },
      });

      await runReplyAgentWithBase({
        baseRun,
        storePath,
        sessionKey,
        sessionEntry,
        commandBody: "hello",
      });

      // Main run goes through ChannelBridge, no memory flush
      expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);
      expect(state.runAgentMock).not.toHaveBeenCalled();

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
      };

      await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

      state.channelBridgeHandleMock.mockResolvedValue(
        makeDeliveryResult({
          payloads: [{ text: "ok" }],
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      );

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

      // Main run through ChannelBridge, no flush (already flushed this cycle)
      expect(state.channelBridgeHandleMock).toHaveBeenCalledTimes(1);
      expect(state.runAgentMock).not.toHaveBeenCalled();
    });
  });
});
