import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelMessage } from "../../middleware/types.js";

// ---------- captured constructor opts & handle mock ----------

type BridgeConstructorOpts = {
  provider: string;
  workspaceDir?: string;
  sessionMap?: unknown;
  gatewayUrl?: string;
  gatewayToken?: string;
  runtimeArgs?: string[];
  runtimeEnv?: Record<string, string>;
};

const bridgeConstructorCalls: BridgeConstructorOpts[] = [];
const bridgeHandleMock = vi.fn<
  (message: ChannelMessage, callbacks?: unknown, abortSignal?: AbortSignal) => Promise<void>
>();

// ---------- mocks ----------

vi.mock("../../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    constructor(opts: BridgeConstructorOpts) {
      bridgeConstructorCalls.push(opts);
    }

    handle(message: ChannelMessage, callbacks?: unknown, abortSignal?: AbortSignal) {
      return bridgeHandleMock(message, callbacks, abortSignal);
    }
  },
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentRuntimeOrThrow: vi.fn().mockReturnValue("claude"),
  resolveAgentRuntimeArgs: vi.fn().mockReturnValue(["--flag-a"]),
  resolveAgentRuntimeEnv: vi.fn().mockReturnValue({ CUSTOM_VAR: "value-1" }),
}));

vi.mock("../../agents/channel-tools.js", () => ({
  resolveChannelMessageToolHints: vi.fn().mockReturnValue([]),
}));

vi.mock("../../config/paths.js", () => ({
  resolveGatewayPort: vi.fn().mockReturnValue(4567),
}));

vi.mock("../../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: vi.fn().mockReturnValue({ token: "gw-test-token" }),
}));

vi.mock("../../globals.js", () => ({
  logVerbose: vi.fn(),
}));

vi.mock("./typing-mode.js", () => ({
  createTypingSignaler: vi.fn().mockReturnValue({
    signalRunStart: vi.fn().mockResolvedValue(undefined),
    signalRunEnd: vi.fn().mockResolvedValue(undefined),
    signalTextDelta: vi.fn().mockResolvedValue(undefined),
    signalReasoningDelta: vi.fn().mockResolvedValue(undefined),
    signalToolStart: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { createFollowupRunner } = await import("./followup-runner.js");

// ---------- helpers ----------

function makeTyping() {
  return {
    onReplyStart: vi.fn().mockResolvedValue(undefined),
    startTypingLoop: vi.fn().mockResolvedValue(undefined),
    startTypingOnText: vi.fn().mockResolvedValue(undefined),
    refreshTypingTtl: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
    markRunComplete: vi.fn(),
    markDispatchIdle: vi.fn(),
    cleanup: vi.fn(),
  };
}

function makeQueued(overrides?: Record<string, unknown>) {
  return {
    prompt: "followup prompt",
    messageId: "msg-001",
    summaryLine: "summary",
    enqueuedAt: Date.now(),
    originatingChannel: "telegram",
    originatingTo: "chat-42",
    originatingAccountId: "acct-7",
    originatingThreadId: "thread-99",
    run: {
      agentId: "agent-1",
      agentDir: "/agents/agent-1",
      sessionId: "sess-abc",
      sessionFile: "/sessions/sess-abc.json",
      workspaceDir: "/workspace/proj",
      config: { agents: { defaults: { runtime: "claude" } } },
      provider: "claude",
      model: "claude-sonnet-4-5",
      timeoutMs: 60_000,
      blockReplyBreak: "text_end" as const,
    },
    ...overrides,
  };
}

// ---------- tests ----------

describe("followup-runner — ChannelBridge wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeConstructorCalls.length = 0;
    bridgeHandleMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes resolved provider to ChannelBridge constructor", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    expect(bridgeConstructorCalls).toHaveLength(1);
    // resolveAgentRuntimeOrThrow is mocked to return "claude"
    expect(bridgeConstructorCalls[0].provider).toBe("claude");
  });

  it("passes workspaceDir from queued.run to ChannelBridge constructor", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    expect(bridgeConstructorCalls[0].workspaceDir).toBe("/workspace/proj");
  });

  it("passes runtimeArgs from resolveAgentRuntimeArgs to ChannelBridge constructor", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    expect(bridgeConstructorCalls[0].runtimeArgs).toEqual(["--flag-a"]);
  });

  it("passes runtimeEnv from resolveAgentRuntimeEnv to ChannelBridge constructor", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    expect(bridgeConstructorCalls[0].runtimeEnv).toEqual({ CUSTOM_VAR: "value-1" });
  });

  it("passes gatewayUrl built from resolveGatewayPort to ChannelBridge constructor", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    // resolveGatewayPort mocked to 4567
    expect(bridgeConstructorCalls[0].gatewayUrl).toBe("ws://127.0.0.1:4567");
  });

  it("passes gatewayToken from resolveGatewayCredentialsFromConfig to ChannelBridge constructor", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    // resolveGatewayCredentialsFromConfig mocked to { token: "gw-test-token" }
    expect(bridgeConstructorCalls[0].gatewayToken).toBe("gw-test-token");
  });

  it("builds sessionMap that reads CLI session ID from session store via provider key", async () => {
    const sessionStore: Record<string, { cliSessionIds?: Record<string, string> }> = {
      "my-key": { cliSessionIds: { claude: "cli-sess-xyz" } },
    };

    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
      sessionStore: sessionStore as never,
      sessionKey: "my-key",
    });

    await runner(makeQueued() as never);

    expect(bridgeConstructorCalls).toHaveLength(1);
    const sessionMap = bridgeConstructorCalls[0].sessionMap as {
      get(): Promise<string | undefined>;
    };
    const cliSessionId = await sessionMap.get();
    expect(cliSessionId).toBe("cli-sess-xyz");
  });

  it("sessionMap returns undefined when sessionKey is not set", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
      // no sessionKey or sessionStore
    });

    await runner(makeQueued() as never);

    const sessionMap = bridgeConstructorCalls[0].sessionMap as {
      get(): Promise<string | undefined>;
    };
    const result = await sessionMap.get();
    expect(result).toBeUndefined();
  });

  it("calls handle() with a correctly built ChannelMessage", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    expect(bridgeHandleMock).toHaveBeenCalledOnce();
    const message = bridgeHandleMock.mock.calls[0][0] as ChannelMessage;
    expect(message.id).toBe("msg-001");
    expect(message.text).toBe("followup prompt");
    expect(message.from).toBe("acct-7");
    expect(message.channelId).toBe("chat-42");
    expect(message.provider).toBe("telegram");
    expect(message.replyToId).toBe("thread-99");
    expect(message.timestamp).toBeTypeOf("number");
  });

  it("passes BridgeCallbacks wired from opts to handle()", async () => {
    const onPartialReply = vi.fn();
    const onBlockReply = vi.fn();
    const onToolResult = vi.fn();

    const runner = createFollowupRunner({
      opts: { onPartialReply, onBlockReply, onToolResult },
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    const callbacks = bridgeHandleMock.mock.calls[0][1] as {
      onPartialReply?: unknown;
      onBlockReply?: unknown;
      onToolResult?: unknown;
    };
    expect(callbacks.onPartialReply).toBe(onPartialReply);
    expect(callbacks.onBlockReply).toBe(onBlockReply);
    expect(callbacks.onToolResult).toBe(onToolResult);
  });

  it("passes abortSignal from opts to handle()", async () => {
    const controller = new AbortController();

    const runner = createFollowupRunner({
      opts: { abortSignal: controller.signal },
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    const abortSignal = bridgeHandleMock.mock.calls[0][2];
    expect(abortSignal).toBe(controller.signal);
  });

  it("generates a UUID for message.id when queued.messageId is absent", async () => {
    const runner = createFollowupRunner({
      typing: makeTyping(),
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued({ messageId: undefined }) as never);

    const message = bridgeHandleMock.mock.calls[0][0] as ChannelMessage;
    // crypto.randomUUID() produces a UUID v4 pattern
    expect(message.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("calls markRunComplete and markDispatchIdle on the typing controller in finally block", async () => {
    const typing = makeTyping();

    const runner = createFollowupRunner({
      typing,
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await runner(makeQueued() as never);

    expect(typing.markRunComplete).toHaveBeenCalledOnce();
    expect(typing.markDispatchIdle).toHaveBeenCalledOnce();
  });

  it("calls typing cleanup even when handle() throws", async () => {
    bridgeHandleMock.mockRejectedValueOnce(new Error("bridge failure"));
    const typing = makeTyping();

    const runner = createFollowupRunner({
      typing,
      typingMode: "never",
      defaultModel: "claude-sonnet-4-5",
    });

    await expect(runner(makeQueued() as never)).rejects.toThrow("bridge failure");

    expect(typing.markRunComplete).toHaveBeenCalledOnce();
    expect(typing.markDispatchIdle).toHaveBeenCalledOnce();
  });
});
