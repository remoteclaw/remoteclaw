import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentRuntime } from "./agent-runtime.js";
import type { AgentEvent, AgentRuntimeParams, ChannelMessage } from "./types.js";
import { ChannelBridge } from "./channel-bridge.js";

function createMockRuntime(events: AgentEvent[]): AgentRuntime {
  return {
    name: "mock-runtime",
    async *execute(_params: AgentRuntimeParams) {
      for (const event of events) {
        yield event;
      }
    },
  };
}

function defaultMessage(overrides?: Partial<ChannelMessage>): ChannelMessage {
  return {
    channelId: "tg",
    userId: "u1",
    threadId: undefined,
    text: "hello",
    workspaceDir: "/tmp",
    ...overrides,
  };
}

describe("ChannelBridge", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns reply with text from done event", async () => {
    const runtime = createMockRuntime([
      { type: "text", text: "Hello " },
      { type: "text", text: "World" },
      {
        type: "done",
        result: {
          text: "Hello World",
          sessionId: "s-1",
          durationMs: 100,
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          aborted: false,
        },
      },
    ]);

    const bridge = new ChannelBridge({ runtime, sessionDir: tmpDir });
    const reply = await bridge.handle(defaultMessage());

    expect(reply.text).toBe("Hello World");
    expect(reply.sessionId).toBe("s-1");
    expect(reply.durationMs).toBe(100);
    expect(reply.aborted).toBe(false);
    expect(reply.error).toBeUndefined();
  });

  it("fires onPartialText callbacks", async () => {
    const runtime = createMockRuntime([
      { type: "text", text: "chunk1" },
      { type: "text", text: "chunk2" },
      {
        type: "done",
        result: {
          text: "chunk1chunk2",
          sessionId: undefined,
          durationMs: 50,
          usage: undefined,
          aborted: false,
        },
      },
    ]);

    const bridge = new ChannelBridge({ runtime, sessionDir: tmpDir });
    const chunks: string[] = [];

    await bridge.handle(defaultMessage(), {
      onPartialText: (text) => {
        chunks.push(text);
      },
    });

    expect(chunks).toEqual(["chunk1", "chunk2"]);
  });

  it("fires onToolUse callbacks", async () => {
    const runtime = createMockRuntime([
      { type: "tool_use", toolId: "t1", toolName: "Read", input: "" },
      {
        type: "done",
        result: {
          text: "",
          sessionId: undefined,
          durationMs: 10,
          usage: undefined,
          aborted: false,
        },
      },
    ]);

    const bridge = new ChannelBridge({ runtime, sessionDir: tmpDir });
    const tools: Array<{ name: string; id: string }> = [];

    await bridge.handle(defaultMessage(), {
      onToolUse: (name, id) => {
        tools.push({ name, id });
      },
    });

    expect(tools).toEqual([{ name: "Read", id: "t1" }]);
  });

  it("fires onError callbacks", async () => {
    const runtime = createMockRuntime([
      { type: "error", message: "rate limit", category: "retryable" },
      {
        type: "done",
        result: {
          text: "",
          sessionId: undefined,
          durationMs: 10,
          usage: undefined,
          aborted: false,
        },
      },
    ]);

    const bridge = new ChannelBridge({ runtime, sessionDir: tmpDir });
    const errors: Array<{ msg: string; cat: string }> = [];

    await bridge.handle(defaultMessage(), {
      onError: (msg, cat) => {
        errors.push({ msg, cat });
      },
    });

    expect(errors).toEqual([{ msg: "rate limit", cat: "retryable" }]);
  });

  it("resumes session from previous interaction", async () => {
    let capturedParams: AgentRuntimeParams | undefined;
    const runtime: AgentRuntime = {
      name: "capture-runtime",
      async *execute(params: AgentRuntimeParams) {
        capturedParams = params;
        yield {
          type: "done" as const,
          result: {
            text: "ok",
            sessionId: "s-first",
            durationMs: 10,
            usage: undefined,
            aborted: false,
          },
        };
      },
    };

    const bridge = new ChannelBridge({ runtime, sessionDir: tmpDir });

    // First message creates session
    await bridge.handle(defaultMessage());
    expect(capturedParams?.sessionId).toBeUndefined();

    // Second message should resume session
    const runtime2: AgentRuntime = {
      name: "capture-runtime",
      async *execute(params: AgentRuntimeParams) {
        capturedParams = params;
        yield {
          type: "done" as const,
          result: {
            text: "ok2",
            sessionId: "s-second",
            durationMs: 10,
            usage: undefined,
            aborted: false,
          },
        };
      },
    };

    const bridge2 = new ChannelBridge({ runtime: runtime2, sessionDir: tmpDir });
    await bridge2.handle(defaultMessage());
    expect(capturedParams?.sessionId).toBe("s-first");
  });

  it("handles generator error gracefully", async () => {
    const runtime: AgentRuntime = {
      name: "error-runtime",
      async *execute() {
        yield { type: "text" as const, text: "partial" };
        throw new Error("generator exploded");
      },
    };

    const bridge = new ChannelBridge({ runtime, sessionDir: tmpDir });
    const reply = await bridge.handle(defaultMessage());

    expect(reply.error).toBe("generator exploded");
    expect(reply.text).toBe("");
  });

  it("passes abort signal to runtime", async () => {
    let receivedSignal: AbortSignal | undefined;
    const runtime: AgentRuntime = {
      name: "signal-runtime",
      async *execute(params: AgentRuntimeParams) {
        receivedSignal = params.abortSignal;
        yield {
          type: "done" as const,
          result: {
            text: "",
            sessionId: undefined,
            durationMs: 0,
            usage: undefined,
            aborted: false,
          },
        };
      },
    };

    const bridge = new ChannelBridge({ runtime, sessionDir: tmpDir });
    const ac = new AbortController();
    await bridge.handle(defaultMessage(), undefined, ac.signal);

    expect(receivedSignal).toBe(ac.signal);
  });
});
