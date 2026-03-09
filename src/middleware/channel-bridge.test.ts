import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionKey, ChannelBridge, type ChannelBridgeOptions } from "./channel-bridge.js";
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
  return {
    execute: vi.fn(() => eventStream(events)),
  };
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

// Mock system-prompt to return a simple string
const mockBuildSystemPrompt = vi.fn((_params: unknown) => "SYSTEM_PROMPT");
vi.mock("./system-prompt.js", () => ({
  buildSystemPrompt: (params: unknown) => mockBuildSystemPrompt(params),
}));

// Mock mcp-side-effects reader to return empty by default
const mockReadSideEffects = vi.fn().mockResolvedValue({
  sentTexts: [],
  sentMediaUrls: [],
  sentTargets: [],
  cronAdds: 0,
});

vi.mock("./mcp-side-effects.js", () => ({
  readMcpSideEffects: (...args: unknown[]) => mockReadSideEffects(...args),
  McpSideEffectsWriter: vi.fn(),
}));

// Mock media-resolver to return controllable attachments
const mockResolveMediaAttachments = vi.fn().mockResolvedValue([]);
vi.mock("./media-resolver.js", () => ({
  resolveMediaAttachments: (...args: unknown[]) => mockResolveMediaAttachments(...args),
}));

// ── Session Map (real-ish, file-backed in temp dir) ─────────────────────

let sessionDir: string;
let sessionMap: InstanceType<typeof import("./session-map.js").SessionMap>;

beforeEach(async () => {
  sessionDir = join(tmpdir(), `rc-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  await mkdir(sessionDir, { recursive: true });
  const { SessionMap } = await import("./session-map.js");
  sessionMap = new SessionMap(sessionDir);

  // Reset mocks
  mockRuntimeInstance = mockRuntime([makeDone()]);
  mockBuildSystemPrompt.mockClear();
  mockReadSideEffects.mockClear();
  mockReadSideEffects.mockResolvedValue({
    sentTexts: [],
    sentMediaUrls: [],
    sentTargets: [],
    cronAdds: 0,
  });
  mockResolveMediaAttachments.mockClear();
  mockResolveMediaAttachments.mockResolvedValue([]);
});

afterEach(async () => {
  await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("ChannelBridge", () => {
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

  describe("handle() orchestration flow", () => {
    it("returns AgentDeliveryResult with payloads from text events", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "text", text: "Hello user" },
        makeDone({ text: "Hello user", sessionId: "sess-1", durationMs: 100 }),
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.payloads).toEqual([{ text: "Hello user" }]);
      expect(result.run.sessionId).toBe("sess-1");
      expect(result.run.durationMs).toBe(100);
      expect(result.error).toBeUndefined();
    });

    it("returns empty payloads when agent produces no text", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.payloads).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it("passes user text as prompt and system prompt separately", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ text: "What is 2+2?" }));

      expect(executeFn).toHaveBeenCalledOnce();
      const params = executeFn.mock.calls[0][0];
      expect(params.prompt).toBe("What is 2+2?");
      expect(params.systemPrompt).toBe("SYSTEM_PROMPT");
    });

    it("passes extraContext as a separate field", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ text: "What is 2+2?", extraContext: "Answer in French" }));

      expect(executeFn).toHaveBeenCalledOnce();
      const params = executeFn.mock.calls[0][0];
      expect(params.prompt).toBe("What is 2+2?");
      expect(params.systemPrompt).toBe("SYSTEM_PROMPT");
      expect(params.extraContext).toBe("Answer in French");
    });

    it("leaves extraContext undefined when not provided", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ text: "What is 2+2?" }));

      expect(executeFn).toHaveBeenCalledOnce();
      const params = executeFn.mock.calls[0][0];
      expect(params.prompt).toBe("What is 2+2?");
      expect(params.extraContext).toBeUndefined();
    });

    it("passes workingDirectory to runtime", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge({ workspaceDir: "/my/workspace" });
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.workingDirectory).toBe("/my/workspace");
    });

    it("forwards abortSignal to runtime", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const controller = new AbortController();
      const bridge = createBridge();
      await bridge.handle(makeMessage(), undefined, controller.signal);

      const params = executeFn.mock.calls[0][0];
      expect(params.abortSignal).toBe(controller.signal);
    });

    it("includes MCP server config in runtime params", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.mcpServers).toBeDefined();
      expect(params.mcpServers!.remoteclaw).toBeDefined();
      expect(params.mcpServers!.remoteclaw.command).toBe("node");
      expect(params.mcpServers!.remoteclaw.args).toEqual(["/path/to/mcp-server.js"]);
    });

    it("reads MCP side effects after execution", async () => {
      mockReadSideEffects.mockResolvedValue({
        sentTexts: ["sent msg"],
        sentMediaUrls: [],
        sentTargets: [],
        cronAdds: 1,
      });

      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(mockReadSideEffects).toHaveBeenCalledOnce();
      expect(result.mcp.sentTexts).toEqual(["sent msg"]);
      expect(result.mcp.cronAdds).toBe(1);
    });

    it("returns empty side effects when file read fails", async () => {
      mockReadSideEffects.mockRejectedValue(new Error("ENOENT"));
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.mcp.sentTexts).toEqual([]);
      expect(result.mcp.cronAdds).toBe(0);
    });
  });

  describe("streaming callbacks", () => {
    it("invokes onPartialReply for chunked text", async () => {
      // Text exceeding chunk limit triggers onPartialReply
      const longText = "a".repeat(50);
      mockRuntimeInstance = mockRuntime([
        { type: "text", text: longText },
        makeDone({ text: longText }),
      ]);

      const onPartialReply = vi.fn();
      const bridge = createBridge({ chunkLimit: 20 });
      await bridge.handle(makeMessage(), { onPartialReply });

      expect(onPartialReply).toHaveBeenCalled();
    });

    it("invokes onBlockReply for final text flush", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "text", text: "Final reply" },
        makeDone({ text: "Final reply" }),
      ]);

      const onBlockReply = vi.fn();
      const bridge = createBridge();
      await bridge.handle(makeMessage(), { onBlockReply });

      expect(onBlockReply).toHaveBeenCalledWith({ text: "Final reply" });
    });

    it("invokes onToolResult for tool result events", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "tool_result", toolId: "t1", output: "file contents" },
        makeDone(),
      ]);

      const onToolResult = vi.fn();
      const bridge = createBridge();
      await bridge.handle(makeMessage(), { onToolResult });

      expect(onToolResult).toHaveBeenCalledWith({ text: "Tool t1 result: file contents" });
    });
  });

  describe("session lifecycle", () => {
    it("looks up existing session and passes sessionId to runtime", async () => {
      const msg = makeMessage();
      const key = buildSessionKey(msg);
      await sessionMap.set(key, "existing-session-42");

      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(msg);

      const params = executeFn.mock.calls[0][0];
      expect(params.sessionId).toBe("existing-session-42");
    });

    it("passes undefined sessionId when no session exists", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.sessionId).toBeUndefined();
    });

    it("stores new sessionId from run result", async () => {
      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "new-session-99" })]);

      const bridge = createBridge();
      const msg = makeMessage();
      await bridge.handle(msg);

      const key = buildSessionKey(msg);
      const stored = await sessionMap.get(key);
      expect(stored).toBe("new-session-99");
    });

    it("does not update session when sessionId is undefined", async () => {
      const msg = makeMessage();
      const key = buildSessionKey(msg);
      await sessionMap.set(key, "old-session");

      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: undefined })]);

      const bridge = createBridge();
      await bridge.handle(msg);

      // Old session should still be there (not overwritten)
      const stored = await sessionMap.get(key);
      expect(stored).toBe("old-session");
    });

    it("uses separate sessions for different threads", async () => {
      const msg1 = makeMessage({ replyToId: "thread-1" });
      const msg2 = makeMessage({ replyToId: "thread-2" });

      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-thread-1" })]);
      const bridge = createBridge();
      await bridge.handle(msg1);

      mockRuntimeInstance = mockRuntime([makeDone({ sessionId: "sess-thread-2" })]);
      await bridge.handle(msg2);

      const stored1 = await sessionMap.get(buildSessionKey(msg1));
      const stored2 = await sessionMap.get(buildSessionKey(msg2));
      expect(stored1).toBe("sess-thread-1");
      expect(stored2).toBe("sess-thread-2");
    });
  });

  describe("MCP config assembly", () => {
    it("sets gateway env vars in MCP config", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge({
        gatewayUrl: "wss://gw.test.com",
        gatewayToken: "secret-token",
      });
      await bridge.handle(makeMessage());

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_GATEWAY_URL).toBe("wss://gw.test.com");
      expect(mcpEnv.REMOTECLAW_GATEWAY_TOKEN).toBe("secret-token");
    });

    it("sets channel and sender env vars", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ provider: "discord", from: "user-42", channelId: "ch-7" }));

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_CHANNEL).toBe("discord");
      expect(mcpEnv.REMOTECLAW_ACCOUNT_ID).toBe("user-42");
      expect(mcpEnv.REMOTECLAW_TO).toBe("ch-7");
    });

    it("sets session key env var in composite format", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({ channelId: "ch-1", from: "user-2", replyToId: "thread-3" }),
      );

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_SESSION_KEY).toBe("ch-1:user-2:thread-3");
    });

    it("uses underscore for missing thread in session key", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ channelId: "ch-1", from: "user-2", replyToId: undefined }));

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_SESSION_KEY).toBe("ch-1:user-2:_");
    });

    it("includes REMOTECLAW_THREAD_ID when replyToId is present", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ replyToId: "thread-99" }));

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_THREAD_ID).toBe("thread-99");
    });

    it("omits REMOTECLAW_THREAD_ID when replyToId is absent", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ replyToId: undefined }));

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_THREAD_ID).toBeUndefined();
    });

    it("sets side effects file path in MCP env", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_SIDE_EFFECTS_FILE).toMatch(/side-effects\.ndjson$/);
    });

    it("sets REMOTECLAW_SENDER_IS_OWNER=true when senderIsOwner is true", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ senderIsOwner: true }));

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_SENDER_IS_OWNER).toBe("true");
    });

    it("sets REMOTECLAW_SENDER_IS_OWNER=false when senderIsOwner is false", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ senderIsOwner: false }));

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_SENDER_IS_OWNER).toBe("false");
    });

    it("defaults REMOTECLAW_SENDER_IS_OWNER to false when not set", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_SENDER_IS_OWNER).toBe("false");
    });

    it("sets REMOTECLAW_TOOL_PROFILE from message", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ toolProfile: "messaging" }));

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_TOOL_PROFILE).toBe("messaging");
    });

    it("defaults REMOTECLAW_TOOL_PROFILE to full when not set", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      const mcpEnv = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.env!;
      expect(mcpEnv.REMOTECLAW_TOOL_PROFILE).toBe("full");
    });
  });

  describe("messageToolHints forwarding", () => {
    it("passes messageToolHints from ChannelMessage to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({
          provider: "discord",
          messageToolHints: [
            "Use the discord_send MCP tool with components.",
            "Forms: pass components.modal to discord_send.",
          ],
        }),
      );

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.messageToolHints).toEqual([
        "Use the discord_send MCP tool with components.",
        "Forms: pass components.modal to discord_send.",
      ]);
    });

    it("passes undefined messageToolHints when message has no hints", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.messageToolHints).toBeUndefined();
    });

    it("passes text-directive hints (LINE model) to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({
          provider: "line",
          messageToolHints: ["[[quick_replies: Option 1, Option 2]]"],
        }),
      );

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.messageToolHints).toEqual(["[[quick_replies: Option 1, Option 2]]"]);
    });

    it("passes auto-detection hints (Feishu model) to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({
          provider: "feishu",
          messageToolHints: [
            "Feishu auto-detects markdown patterns and renders them as Card Kit 2.0.",
          ],
        }),
      );

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.messageToolHints).toEqual([
        "Feishu auto-detects markdown patterns and renders them as Card Kit 2.0.",
      ]);
    });
  });

  describe("system prompt context params forwarding", () => {
    it("passes userName from ChannelMessage to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(makeMessage({ userName: "Alice" }));

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.userName).toBe("Alice");
    });

    it("passes agentId from ChannelMessage to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(makeMessage({ agentId: "agent-42" }));

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.agentId).toBe("agent-42");
    });

    it("passes timezone from ChannelMessage to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(makeMessage({ timezone: "America/New_York" }));

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.timezone).toBe("America/New_York");
    });

    it("passes authorizedSenders from ChannelMessage to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(makeMessage({ authorizedSenders: ["+15551234567", "+15559876543"] }));

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.authorizedSenders).toEqual(["+15551234567", "+15559876543"]);
    });

    it("passes reactionGuidance from ChannelMessage to buildSystemPrompt", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({ reactionGuidance: { level: "minimal", channel: "telegram" } }),
      );

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.reactionGuidance).toEqual({ level: "minimal", channel: "telegram" });
    });

    it("passes all 8 params when ChannelMessage is fully populated", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({
          provider: "discord",
          messageToolHints: ["Use discord components."],
          userName: "Bob",
          agentId: "agent-7",
          timezone: "Europe/Berlin",
          authorizedSenders: ["+1234"],
          reactionGuidance: { level: "extensive", channel: "discord" },
        }),
      );

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.channelName).toBe("discord");
      expect(params.workspaceDir).toBe("/workspace");
      expect(params.messageToolHints).toEqual(["Use discord components."]);
      expect(params.userName).toBe("Bob");
      expect(params.agentId).toBe("agent-7");
      expect(params.timezone).toBe("Europe/Berlin");
      expect(params.authorizedSenders).toEqual(["+1234"]);
      expect(params.reactionGuidance).toEqual({ level: "extensive", channel: "discord" });
    });

    it("passes undefined for optional params when not set on ChannelMessage", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
      const params = mockBuildSystemPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(params.userName).toBeUndefined();
      expect(params.agentId).toBeUndefined();
      expect(params.timezone).toBeUndefined();
      expect(params.authorizedSenders).toBeUndefined();
      expect(params.reactionGuidance).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("classifies runtime errors and sets errorSubtype on result", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => failingStream("rate_limit exceeded"));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.error).toContain("rate_limit");
      expect(result.run.errorSubtype).toBe("retryable");
      expect(result.payloads).toEqual([]);
    });

    it("classifies context overflow errors", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) =>
        failingStream("context_window limit exceeded"),
      );
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.run.errorSubtype).toBe("context_window");
    });

    it("classifies fatal errors", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => failingStream("unexpected crash"));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.run.errorSubtype).toBe("fatal");
    });

    it("captures error from error events in the stream", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "error", message: "Tool execution failed" },
        makeDone(),
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.error).toBe("Tool execution failed");
    });

    it("still reads side effects after runtime error", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => failingStream("crash"));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      expect(mockReadSideEffects).toHaveBeenCalledOnce();
    });
  });

  describe("inbound media forwarding", () => {
    it("resolves mediaUrls and passes media to runtime.execute()", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };
      mockResolveMediaAttachments.mockResolvedValue([
        {
          mimeType: "image/jpeg",
          filePath: "/tmp/photo.jpg",
          sourceUrl: "https://cdn.example.com/photo.jpg",
        },
      ]);

      const bridge = createBridge();
      await bridge.handle(makeMessage({ mediaUrls: ["https://cdn.example.com/photo.jpg"] }));

      expect(mockResolveMediaAttachments).toHaveBeenCalledOnce();
      expect(mockResolveMediaAttachments.mock.calls[0][0]).toEqual([
        "https://cdn.example.com/photo.jpg",
      ]);
      const params = executeFn.mock.calls[0][0];
      expect(params.media).toEqual([
        {
          mimeType: "image/jpeg",
          filePath: "/tmp/photo.jpg",
          sourceUrl: "https://cdn.example.com/photo.jpg",
        },
      ]);
    });

    it("does not resolve media when mediaUrls is empty", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage({ mediaUrls: [] }));

      expect(mockResolveMediaAttachments).not.toHaveBeenCalled();
      const params = executeFn.mock.calls[0][0];
      expect(params.media).toBeUndefined();
    });

    it("does not resolve media when mediaUrls is undefined", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      await bridge.handle(makeMessage());

      expect(mockResolveMediaAttachments).not.toHaveBeenCalled();
      const params = executeFn.mock.calls[0][0];
      expect(params.media).toBeUndefined();
    });

    it("passes undefined media when resolver returns empty array", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };
      mockResolveMediaAttachments.mockResolvedValue([]);

      const bridge = createBridge();
      await bridge.handle(makeMessage({ mediaUrls: ["https://cdn.example.com/bad"] }));

      expect(mockResolveMediaAttachments).toHaveBeenCalledOnce();
      const params = executeFn.mock.calls[0][0];
      expect(params.media).toBeUndefined();
    });

    it("passes multiple resolved media attachments", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };
      mockResolveMediaAttachments.mockResolvedValue([
        { mimeType: "image/jpeg", filePath: "/tmp/a.jpg" },
        { mimeType: "audio/ogg", filePath: "/tmp/b.ogg" },
      ]);

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({
          mediaUrls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.ogg"],
        }),
      );

      const params = executeFn.mock.calls[0][0];
      expect(params.media).toHaveLength(2);
    });
  });

  describe("unsupported media warnings", () => {
    it("prepends warning payload when runtime does not accept media type", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) =>
        eventStream([{ type: "text", text: "Reply" }, makeDone({ text: "Reply" })]),
      );
      mockRuntimeInstance = {
        execute: executeFn,
        mediaCapabilities: { acceptsInbound: ["image/"], emitsOutbound: false },
      };
      mockResolveMediaAttachments.mockResolvedValue([
        { mimeType: "image/jpeg", filePath: "/tmp/photo.jpg" },
        { mimeType: "audio/ogg", filePath: "/tmp/voice.ogg" },
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(
        makeMessage({
          mediaUrls: ["https://cdn.example.com/photo.jpg", "https://cdn.example.com/voice.ogg"],
        }),
      );

      // Warning should be first payload
      expect(result.payloads.length).toBeGreaterThanOrEqual(2);
      expect(result.payloads[0].text).toContain("audio");
      expect(result.payloads[0].text).toContain("not included");
      // Agent reply follows
      expect(result.payloads[1].text).toBe("Reply");
    });

    it("only passes supported media to runtime.execute()", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = {
        execute: executeFn,
        mediaCapabilities: { acceptsInbound: ["image/"], emitsOutbound: false },
      };
      mockResolveMediaAttachments.mockResolvedValue([
        { mimeType: "image/jpeg", filePath: "/tmp/photo.jpg" },
        { mimeType: "audio/ogg", filePath: "/tmp/voice.ogg" },
      ]);

      const bridge = createBridge();
      await bridge.handle(
        makeMessage({
          mediaUrls: ["https://cdn.example.com/photo.jpg", "https://cdn.example.com/voice.ogg"],
        }),
      );

      const params = executeFn.mock.calls[0][0];
      expect(params.media).toEqual([{ mimeType: "image/jpeg", filePath: "/tmp/photo.jpg" }]);
    });

    it("does not add warning when all media is supported", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) =>
        eventStream([{ type: "text", text: "Reply" }, makeDone({ text: "Reply" })]),
      );
      mockRuntimeInstance = {
        execute: executeFn,
        mediaCapabilities: { acceptsInbound: ["image/"], emitsOutbound: false },
      };
      mockResolveMediaAttachments.mockResolvedValue([
        { mimeType: "image/jpeg", filePath: "/tmp/photo.jpg" },
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(
        makeMessage({ mediaUrls: ["https://cdn.example.com/photo.jpg"] }),
      );

      expect(result.payloads).toEqual([{ text: "Reply" }]);
    });

    it("passes all media through when runtime has no mediaCapabilities", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };
      mockResolveMediaAttachments.mockResolvedValue([
        { mimeType: "audio/ogg", filePath: "/tmp/voice.ogg" },
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(
        makeMessage({ mediaUrls: ["https://cdn.example.com/voice.ogg"] }),
      );

      const params = executeFn.mock.calls[0][0];
      expect(params.media).toEqual([{ mimeType: "audio/ogg", filePath: "/tmp/voice.ogg" }]);
      // No warning
      expect(result.payloads.every((p) => !p.text?.includes("not included"))).toBe(true);
    });

    it("passes undefined media when all attachments are unsupported", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = {
        execute: executeFn,
        mediaCapabilities: { acceptsInbound: [], emitsOutbound: false },
      };
      mockResolveMediaAttachments.mockResolvedValue([
        { mimeType: "image/jpeg", filePath: "/tmp/photo.jpg" },
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(
        makeMessage({ mediaUrls: ["https://cdn.example.com/photo.jpg"] }),
      );

      const params = executeFn.mock.calls[0][0];
      expect(params.media).toBeUndefined();
      // Warning present
      expect(result.payloads[0].text).toContain("not included");
    });
  });

  describe("outbound media delivery", () => {
    it("delivers media events as ReplyPayload with mediaUrl", async () => {
      mockRuntimeInstance = mockRuntime([
        {
          type: "media" as const,
          media: { mimeType: "image/png", filePath: "/workspace/output.png" },
        },
        makeDone(),
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.payloads).toEqual([{ mediaUrl: "/workspace/output.png" }]);
    });

    it("delivers interleaved text and media payloads", async () => {
      mockRuntimeInstance = mockRuntime([
        { type: "text", text: "Here is the chart:" },
        {
          type: "media" as const,
          media: { mimeType: "image/png", filePath: "/workspace/chart.png" },
        },
        makeDone({ text: "Here is the chart:" }),
      ]);

      const bridge = createBridge();
      const result = await bridge.handle(makeMessage());

      expect(result.payloads).toEqual([
        { text: "Here is the chart:" },
        { mediaUrl: "/workspace/chart.png" },
      ]);
    });
  });

  describe("temp directory cleanup", () => {
    it("completes without error after successful execution (cleanup in finally)", async () => {
      mockRuntimeInstance = mockRuntime([makeDone()]);

      const bridge = createBridge();
      // handle() returns without throwing — the finally block cleaned up the temp dir
      await expect(bridge.handle(makeMessage())).resolves.toBeDefined();
    });

    it("completes without error after runtime error (cleanup in finally)", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => failingStream("crash"));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = createBridge();
      // handle() returns without throwing even when runtime fails — finally block ran
      await expect(bridge.handle(makeMessage())).resolves.toBeDefined();
    });
  });

  describe("constructor defaults", () => {
    it("uses default workspace dir when not specified", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = new ChannelBridge({
        provider: "claude",
        sessionMap,
        gatewayUrl: "wss://gw.test.com",
        gatewayToken: "tok",
      });
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.workingDirectory).toBe(".");
    });

    it("uses default MCP server path when not specified", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = new ChannelBridge({
        provider: "claude",
        sessionMap,
        gatewayUrl: "wss://gw.test.com",
        gatewayToken: "tok",
      });
      await bridge.handle(makeMessage());

      const mcpArgs = executeFn.mock.calls[0][0].mcpServers!.remoteclaw.args!;
      expect(mcpArgs[0]).toContain("mcp-server.js");
    });

    it("passes runtimeArgs as extraArgs to runtime.execute()", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = new ChannelBridge({
        provider: "claude",
        sessionMap,
        gatewayUrl: "wss://gw.test.com",
        gatewayToken: "tok",
        runtimeArgs: ["--dangerously-skip-permissions"],
      });
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.extraArgs).toEqual(["--dangerously-skip-permissions"]);
    });

    it("leaves extraArgs undefined when runtimeArgs is not specified", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = new ChannelBridge({
        provider: "claude",
        sessionMap,
        gatewayUrl: "wss://gw.test.com",
        gatewayToken: "tok",
      });
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.extraArgs).toBeUndefined();
    });

    it("passes runtimeEnv as env to runtime.execute()", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = new ChannelBridge({
        provider: "claude",
        sessionMap,
        gatewayUrl: "wss://gw.test.com",
        gatewayToken: "tok",
        runtimeEnv: { ANTHROPIC_API_KEY: "sk-ant-test" },
      });
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-test" });
    });

    it("leaves env undefined when runtimeEnv is not specified", async () => {
      const executeFn = vi.fn((_p: AgentExecuteParams) => eventStream([makeDone()]));
      mockRuntimeInstance = { execute: executeFn };

      const bridge = new ChannelBridge({
        provider: "claude",
        sessionMap,
        gatewayUrl: "wss://gw.test.com",
        gatewayToken: "tok",
      });
      await bridge.handle(makeMessage());

      const params = executeFn.mock.calls[0][0];
      expect(params.env).toBeUndefined();
    });
  });
});

describe("buildSessionKey", () => {
  it("maps ChannelMessage fields to SessionKey", () => {
    const key = buildSessionKey(
      makeMessage({ channelId: "ch-1", from: "user-2", replyToId: "thread-3" }),
    );
    expect(key).toEqual({ channelId: "ch-1", userId: "user-2", threadId: "thread-3" });
  });

  it("sets threadId to undefined when replyToId is absent", () => {
    const key = buildSessionKey(makeMessage({ replyToId: undefined }));
    expect(key.threadId).toBeUndefined();
  });
});
