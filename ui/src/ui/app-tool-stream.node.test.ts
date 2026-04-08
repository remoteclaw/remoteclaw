import { beforeAll, describe, expect, it } from "vitest";
import {
  consumeThinkingStream,
  handleAgentEvent,
  resetToolStream,
  type ToolStreamEntry,
} from "./app-tool-stream.ts";

type ToolStreamHost = Parameters<typeof handleAgentEvent>[0];
type MutableHost = ToolStreamHost & {
  compactionStatus?: unknown;
  compactionClearTimer?: number | null;
};

function createHost(overrides?: Partial<MutableHost>): MutableHost {
  return {
    sessionKey: "main",
    chatRunId: null,
    toolStreamById: new Map<string, ToolStreamEntry>(),
    toolStreamOrder: [],
    chatToolMessages: [],
    toolStreamSyncTimer: null,
    chatThinkingStream: null,
    compactionStatus: null,
    compactionClearTimer: null,
    ...overrides,
  };
}

describe("app-tool-stream thinking event handling", () => {
  beforeAll(() => {
    const globalWithWindow = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
    };
    if (!globalWithWindow.window) {
      globalWithWindow.window = globalThis as unknown as Window & typeof globalThis;
    }
  });

  it("accumulates thinking text from thinking stream events", () => {
    const host = createHost({ chatRunId: "run-1" });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "thinking",
      ts: Date.now(),
      data: { text: "Let me think about this..." },
    });

    expect(host.chatThinkingStream).toBe("Let me think about this...");
  });

  it("concatenates multiple thinking events with newlines", () => {
    const host = createHost({ chatRunId: "run-1" });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "thinking",
      ts: Date.now(),
      data: { text: "First thought" },
    });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 2,
      stream: "thinking",
      ts: Date.now(),
      data: { text: "Second thought" },
    });

    expect(host.chatThinkingStream).toBe("First thought\nSecond thought");
  });

  it("ignores thinking events with empty text", () => {
    const host = createHost({ chatRunId: "run-1" });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "thinking",
      ts: Date.now(),
      data: { text: "" },
    });

    expect(host.chatThinkingStream).toBeNull();
  });

  it("ignores thinking events for different runs", () => {
    const host = createHost({ chatRunId: "run-1" });

    handleAgentEvent(host, {
      runId: "run-other",
      seq: 1,
      stream: "thinking",
      ts: Date.now(),
      data: { text: "Wrong run thinking" },
    });

    expect(host.chatThinkingStream).toBeNull();
  });

  it("consumeThinkingStream returns and clears accumulated text", () => {
    const host = createHost({ chatRunId: "run-1" });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "thinking",
      ts: Date.now(),
      data: { text: "Some thinking" },
    });

    const result = consumeThinkingStream(host);
    expect(result).toBe("Some thinking");
    expect(host.chatThinkingStream).toBeNull();
  });

  it("consumeThinkingStream returns null when no thinking accumulated", () => {
    const host = createHost();
    expect(consumeThinkingStream(host)).toBeNull();
  });

  it("resetToolStream clears thinking stream", () => {
    const host = createHost({ chatRunId: "run-1" });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "thinking",
      ts: Date.now(),
      data: { text: "Some thinking" },
    });

    expect(host.chatThinkingStream).toBe("Some thinking");
    resetToolStream(host);
    expect(host.chatThinkingStream).toBeNull();
  });
});
