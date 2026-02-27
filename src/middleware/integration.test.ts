import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplyPayload } from "../auto-reply/types.js";
import { buildSessionKey, ChannelBridge, type ChannelBridgeOptions } from "./channel-bridge.js";
import { SessionMap } from "./session-map.js";
import type {
  AgentEvent,
  AgentExecuteParams,
  AgentRunResult,
  AgentRuntime,
  ChannelMessage,
} from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Create an async iterable from an array of events. */
async function* eventStream(events: AgentEvent[]): AsyncIterable<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

/** Create a done event with configurable result fields. */
function makeDone(overrides?: Partial<AgentRunResult>): AgentEvent {
  return {
    type: "done",
    result: {
      text: "",
      sessionId: undefined,
      durationMs: 0,
      usage: undefined,
      aborted: false,
      ...overrides,
    },
  };
}

/** Create a minimal ChannelMessage. */
function makeMessage(overrides?: Partial<ChannelMessage>): ChannelMessage {
  return {
    id: "msg-1",
    text: "Hello agent",
    from: "user-123",
    channelId: "chat-456",
    provider: "telegram",
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Create a mock AgentRuntime that yields given events. */
function mockRuntime(events: AgentEvent[]): AgentRuntime {
  return { execute: vi.fn(() => eventStream(events)) };
}

/** Create an async iterable that throws on first iteration. */
function failingStream(message: string): AsyncIterable<AgentEvent> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<AgentEvent>> {
          throw new Error(message);
        },
      };
    },
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────

// Mock runtime-factory to return controllable runtime
let mockRuntimeInstance: AgentRuntime;

vi.mock("./runtime-factory.js", () => ({
  createCliRuntime: vi.fn(() => mockRuntimeInstance),
}));

// ── Suite ────────────────────────────────────────────────────────────────

describe("M2 middleware integration", () => {
  let tempDir: string;
  let sessionMap: SessionMap;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `rc-integ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    await mkdir(tempDir, { recursive: true });
    sessionMap = new SessionMap(tempDir);
    mockRuntimeInstance = mockRuntime([makeDone()]);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  function createBridge(overrides?: Partial<ChannelBridgeOptions>): ChannelBridge {
    return new ChannelBridge({
      provider: "claude",
      sessionMap,
      gatewayUrl: "wss://gw.example.com",
      gatewayToken: "test-token",
      workspaceDir: "/workspace",
      mcpServerPath: "/path/to/mcp-server.js",
      ...overrides,
    });
  }

  // ── Basic pipeline flow ──────────────────────────────────────────────

  describe("basic pipeline flow", () => {
    it("routes a channel message through the full pipeline and returns AgentDeliveryResult", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "text", text: "Hello from agent" },
        makeDone({ text: "Hello from agent", sessionId: "sess-1", durationMs: 42 }),
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.payloads).toEqual([{ text: "Hello from agent" }]);
      expect(result.run.sessionId).toBe("sess-1");
      expect(result.run.durationMs).toBe(42);
      expect(result.run.aborted).toBe(false);
      expect(result.mcp.sentTexts).toEqual([]);
      expect(result.mcp.cronAdds).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it("persists session after first call", async () => {
      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "new-sess-42" })]);

      const bridge = createBridge();
      const msg = makeMessage();
      await bridge.handle(msg);

      const stored = await sessionMap.get(buildSessionKey(msg));
      expect(stored).toBe("new-sess-42");
    });

    it("resumes session on second call (sessionId passed to runtime)", async () => {
      // First call — stores session
      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-resume" })]);
      const bridge = createBridge();
      const msg = makeMessage();
      await bridge.handle(msg);

      // Second call — should resume
      const executeFn = vi.fn((_p: AgentExecuteParams) =>
        eventStream([makeDone({ sessionId: "sess-resume" })]),
      );
      mockRuntimeInstance = { execute: executeFn };
      await bridge.handle(msg);

      expect(executeFn.mock.calls[0][0].sessionId).toBe("sess-resume");
    });
  });

  // ── Streaming callbacks ────────────────────────────────────────────

  describe("streaming callbacks", () => {
    it("fires onBlockReply with final text payload", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "text", text: "Final answer" },
        makeDone({ text: "Final answer" }),
      ]);

      const onBlockReply = vi.fn();
      const bridge = createBridge();
      await bridge.handle(makeMessage(), { onBlockReply });

      expect(onBlockReply).toHaveBeenCalledWith({ text: "Final answer" });
    });

    it("fires onToolResult when runtime emits tool_result events", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "tool_result", toolId: "tool-1", output: "result data" },
        makeDone(),
      ]);

      const onToolResult = vi.fn();
      const bridge = createBridge();
      await bridge.handle(makeMessage(), { onToolResult });

      expect(onToolResult).toHaveBeenCalledWith({ text: "Tool tool-1 result: result data" });
    });

    it("fires onPartialReply when text exceeds chunk limit", async () => {
      const longText = "word ".repeat(100); // 500 chars
      mockRuntimeInstance = mockRuntime([
        { type: "text", text: longText },
        makeDone({ text: longText }),
      ]);

      const onPartialReply = vi.fn();
      const bridge = createBridge({ chunkLimit: 50 });
      await bridge.handle(makeMessage(), { onPartialReply });

      expect(onPartialReply).toHaveBeenCalled();
      // Each partial chunk should be within the limit
      for (const call of onPartialReply.mock.calls) {
        const payload = call[0] as ReplyPayload;
        expect(payload.text!.length).toBeLessThanOrEqual(50);
      }
    });
  });

  // ── Security context propagation ───────────────────────────────────

  describe("security context propagation", () => {
    function captureMcpEnv(message: ChannelMessage): Promise<Record<string, string>> {
      return new Promise((resolve) => {
        const executeFn = vi.fn((params: AgentExecuteParams) => {
          resolve(params.mcpServers!.remoteclaw.env!);
          return eventStream([makeDone()]);
        });
        mockRuntimeInstance = { execute: executeFn };
        const bridge = createBridge();
        void bridge.handle(message);
      });
    }

    it("propagates senderIsOwner=true to MCP env", async () => {
      const env = await captureMcpEnv(makeMessage({ senderIsOwner: true }));
      expect(env.REMOTECLAW_SENDER_IS_OWNER).toBe("true");
    });

    it("propagates senderIsOwner=false to MCP env", async () => {
      const env = await captureMcpEnv(makeMessage({ senderIsOwner: false }));
      expect(env.REMOTECLAW_SENDER_IS_OWNER).toBe("false");
    });

    it("propagates toolProfile to MCP env", async () => {
      const env = await captureMcpEnv(makeMessage({ toolProfile: "messaging" }));
      expect(env.REMOTECLAW_TOOL_PROFILE).toBe("messaging");
    });

    it("defaults senderIsOwner=false and toolProfile=full when not set", async () => {
      const env = await captureMcpEnv(makeMessage());
      expect(env.REMOTECLAW_SENDER_IS_OWNER).toBe("false");
      expect(env.REMOTECLAW_TOOL_PROFILE).toBe("full");
    });
  });

  // ── Error handling ──────────────────────────────────────────────────

  describe("error handling", () => {
    it("classifies runtime throw and sets errorSubtype on result", async () => {
      mockRuntimeInstance = {
        execute: vi.fn(() => failingStream("rate_limit exceeded")),
      };

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.error).toContain("rate_limit");
      expect(result.run.errorSubtype).toBe("retryable");
      expect(result.payloads).toEqual([]);
    });

    it("translates context_overflow to context_window errorSubtype", async () => {
      mockRuntimeInstance = {
        execute: vi.fn(() => failingStream("context_window limit exceeded")),
      };

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.run.errorSubtype).toBe("context_window");
    });

    it("captures error from error events in the stream", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "error", message: "Something went wrong" },
        makeDone(),
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.error).toBe("Something went wrong");
    });

    it("returns empty side effects when side effects file is missing (graceful fallback)", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      // Since no real MCP server ran, no side effects file exists — fallback to empty
      expect(result.mcp).toEqual({
        sentTexts: [],
        sentMediaUrls: [],
        sentTargets: [],
        cronAdds: 0,
      });
    });
  });

  // ── Session isolation ──────────────────────────────────────────────

  describe("session isolation", () => {
    it("creates distinct sessions for different channelId/from/replyToId", async () => {
      const bridge = createBridge();

      // Message in channel A
      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-a" })]);
      const msgA = makeMessage({ channelId: "ch-a", from: "user-1" });
      await bridge.handle(msgA);

      // Message in channel B
      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-b" })]);
      const msgB = makeMessage({ channelId: "ch-b", from: "user-1" });
      await bridge.handle(msgB);

      // Message from different user in same channel
      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-c" })]);
      const msgC = makeMessage({ channelId: "ch-a", from: "user-2" });
      await bridge.handle(msgC);

      expect(await sessionMap.get(buildSessionKey(msgA))).toBe("sess-a");
      expect(await sessionMap.get(buildSessionKey(msgB))).toBe("sess-b");
      expect(await sessionMap.get(buildSessionKey(msgC))).toBe("sess-c");
    });

    it("reuses session for same composite key", async () => {
      const bridge = createBridge();

      // First call stores session
      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-shared" })]);
      const msg = makeMessage({ channelId: "ch-1", from: "user-1", replyToId: "thread-1" });
      await bridge.handle(msg);

      // Second call with same key — should resume
      const executeFn = vi.fn((_p: AgentExecuteParams) =>
        eventStream([makeDone({ sessionId: "sess-shared" })]),
      );
      mockRuntimeInstance = { execute: executeFn };
      await bridge.handle(msg);

      expect(executeFn.mock.calls[0][0].sessionId).toBe("sess-shared");
    });

    it("isolates sessions for different threads in same channel", async () => {
      const bridge = createBridge();

      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-t1" })]);
      await bridge.handle(makeMessage({ replyToId: "thread-1" }));

      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-t2" })]);
      await bridge.handle(makeMessage({ replyToId: "thread-2" }));

      const key1 = buildSessionKey(makeMessage({ replyToId: "thread-1" }));
      const key2 = buildSessionKey(makeMessage({ replyToId: "thread-2" }));
      expect(await sessionMap.get(key1)).toBe("sess-t1");
      expect(await sessionMap.get(key2)).toBe("sess-t2");
    });
  });

  // ── MCP config assembly ────────────────────────────────────────────

  describe("MCP config assembly", () => {
    async function captureRuntimeParams(
      message: ChannelMessage,
      bridgeOverrides?: Partial<ChannelBridgeOptions>,
    ): Promise<AgentExecuteParams> {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };
      const bridge = createBridge(bridgeOverrides);
      await bridge.handle(message);
      return executeFn.mock.calls[0][0];
    }

    it("sets all required REMOTECLAW env vars", async () => {
      const params = await captureRuntimeParams(
        makeMessage({
          channelId: "ch-1",
          from: "user-2",
          replyToId: "thread-3",
          senderIsOwner: true,
          toolProfile: "messaging",
        }),
        { gatewayUrl: "wss://gw.test.com", gatewayToken: "tok-123" },
      );

      const env = params.mcpServers!.remoteclaw.env!;
      expect(env.REMOTECLAW_GATEWAY_URL).toBe("wss://gw.test.com");
      expect(env.REMOTECLAW_GATEWAY_TOKEN).toBe("tok-123");
      expect(env.REMOTECLAW_SESSION_KEY).toBe("ch-1:user-2:thread-3");
      expect(env.REMOTECLAW_SIDE_EFFECTS_FILE).toMatch(/side-effects\.ndjson$/);
      expect(env.REMOTECLAW_CHANNEL).toBe("telegram");
      expect(env.REMOTECLAW_ACCOUNT_ID).toBe("user-2");
      expect(env.REMOTECLAW_TO).toBe("ch-1");
      expect(env.REMOTECLAW_THREAD_ID).toBe("thread-3");
      expect(env.REMOTECLAW_SENDER_IS_OWNER).toBe("true");
      expect(env.REMOTECLAW_TOOL_PROFILE).toBe("messaging");
    });

    it("includes REMOTECLAW_THREAD_ID when replyToId is set", async () => {
      const params = await captureRuntimeParams(makeMessage({ replyToId: "thread-99" }));
      expect(params.mcpServers!.remoteclaw.env!.REMOTECLAW_THREAD_ID).toBe("thread-99");
    });

    it("omits REMOTECLAW_THREAD_ID when replyToId is absent", async () => {
      const params = await captureRuntimeParams(makeMessage({ replyToId: undefined }));
      expect(params.mcpServers!.remoteclaw.env!.REMOTECLAW_THREAD_ID).toBeUndefined();
    });
  });
});
