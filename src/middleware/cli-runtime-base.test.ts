import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent, AgentRuntimeParams } from "./types.js";

type MockChild = EventEmitter & {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
  });
  return child;
}

const spawnMock = vi.fn<(...args: unknown[]) => MockChild>();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// Import after mock
const { CLIRuntimeBase } = await import("./cli-runtime-base.js");
type CLIRuntimeConfig = import("./cli-runtime-base.js").CLIRuntimeConfig;

class TestRuntime extends CLIRuntimeBase {
  readonly name = "test-cli";
  private readonly _config: CLIRuntimeConfig;

  constructor(config?: Partial<CLIRuntimeConfig>) {
    super();
    this._config = {
      command: "test-cmd",
      buildArgs: () => ["--flag"],
      buildEnv: () => ({}),
      ...config,
    };
  }

  protected config(): CLIRuntimeConfig {
    return this._config;
  }
}

class WatchdogTestRuntime extends CLIRuntimeBase {
  readonly name = "watchdog-test-cli";
  private readonly _watchdogMs: number | undefined;

  constructor(watchdogMs: number | undefined) {
    super();
    this._watchdogMs = watchdogMs;
  }

  protected config(): CLIRuntimeConfig {
    return { command: "test-cmd", buildArgs: () => [], buildEnv: () => ({}) };
  }

  protected override resolveWatchdogMs(_params: AgentRuntimeParams): number | undefined {
    return this._watchdogMs;
  }
}

function defaultParams(overrides?: Partial<AgentRuntimeParams>): AgentRuntimeParams {
  return {
    prompt: "hello",
    sessionId: undefined,
    workspaceDir: "/tmp/test",
    ...overrides,
  };
}

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of iterable) {
    events.push(e);
  }
  return events;
}

describe("CLIRuntimeBase", () => {
  afterEach(() => {
    spawnMock.mockClear();
  });

  it("yields text events and done on happy path", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams());

    // Emit NDJSON lines (actual Claude CLI stream-json format)
    const systemLine = JSON.stringify({
      type: "system",
      session_id: "s1",
    });
    const textLine = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "world" }] },
    });
    const resultLine = JSON.stringify({
      type: "result",
      result: "world",
      session_id: "s1",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    queueMicrotask(() => {
      child.stdout.emit(
        "data",
        Buffer.from(systemLine + "\n" + textLine + "\n" + resultLine + "\n"),
      );
      child.emit("close", 0);
    });

    const events = await collectEvents(iter);

    expect(events).toEqual([
      { type: "text", text: "world" },
      {
        type: "done",
        result: {
          text: "world",
          sessionId: "s1",
          durationMs: expect.any(Number),
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
            costUsd: undefined,
            webSearchRequests: undefined,
          },
          aborted: false,
          totalCostUsd: undefined,
          apiDurationMs: undefined,
          numTurns: undefined,
          stopReason: undefined,
          errorSubtype: undefined,
          permissionDenials: undefined,
        },
      },
    ]);
  });

  it("yields error event on non-zero exit with stderr", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => {
      child.stderr.emit("data", Buffer.from("unauthorized access"));
      child.emit("close", 1);
    });

    const events = await collectEvents(iter);
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toEqual({ type: "error", message: "unauthorized access", category: "fatal" });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
  });

  it("yields error with exit code when stderr is empty", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => {
      child.emit("close", 2);
    });

    const events = await collectEvents(iter);
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toEqual({
      type: "error",
      message: "Process exited with code 2",
      category: "fatal",
    });
  });

  it("handles abort signal", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const ac = new AbortController();
    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams({ abortSignal: ac.signal }));

    queueMicrotask(() => {
      ac.abort();
      // Simulate process closing after abort
      setTimeout(() => child.emit("close", null), 10);
    });

    const events = await collectEvents(iter);
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toEqual({ type: "error", message: "Aborted by user", category: "aborted" });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent?.type === "done" && doneEvent.result.aborted).toBe(true);
  });

  it("handles timeout", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams({ timeoutMs: 50 }));

    // Let the timeout fire, then close the process
    setTimeout(() => {
      child.emit("close", null);
    }, 100);

    const events = await collectEvents(iter);
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toEqual({
      type: "error",
      message: "Timed out after 50ms",
      category: "timeout",
    });
  });

  it("handles partial line buffering across chunks", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams());

    const fullLine = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "buffered" }] },
    });

    // Split the line across two chunks
    const midpoint = Math.floor(fullLine.length / 2);

    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(fullLine.slice(0, midpoint)));
      child.stdout.emit("data", Buffer.from(fullLine.slice(midpoint) + "\n"));
      child.emit("close", 0);
    });

    const events = await collectEvents(iter);
    expect(events.find((e) => e.type === "text")).toEqual({ type: "text", text: "buffered" });
  });

  it("skips malformed NDJSON lines", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("NOT JSON\n"));
      child.emit("close", 0);
    });

    const events = await collectEvents(iter);
    // Only done event, no errors from malformed lines
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });

  it("streams events before process exits", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams());

    const textLine1 = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "first" }] },
    });
    const textLine2 = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "second" }] },
    });

    const received: AgentEvent[] = [];

    // Emit first line, then defer close
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(textLine1 + "\n"));
    });

    // Consume events one at a time to verify streaming
    const iterator = iter[Symbol.asyncIterator]();

    // First event should arrive before close
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ type: "text", text: "first" });
    received.push(first.value);

    // Now emit second line and close
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(textLine2 + "\n"));
      child.emit("close", 0);
    });

    // Consume remaining
    let result = await iterator.next();
    while (!result.done) {
      received.push(result.value);
      result = await iterator.next();
    }

    // First text event was received before close fired
    expect(received[0]).toEqual({ type: "text", text: "first" });
    expect(received[1]).toEqual({ type: "text", text: "second" });
    expect(received[received.length - 1].type).toBe("done");
  });

  it("flushes remainder line on close", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime();
    const iter = runtime.execute(defaultParams());

    const textLine = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "remainder" }] },
    });

    // Emit data without trailing newline, then close
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(textLine));
      child.emit("close", 0);
    });

    const events = await collectEvents(iter);
    expect(events.find((e) => e.type === "text")).toEqual({ type: "text", text: "remainder" });
  });

  it("writes stdin when buildStdin returns content", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime({
      command: "test-cmd",
      buildArgs: () => [],
      buildEnv: () => ({}),
      buildStdin: () => "stdin content",
    });

    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => {
      child.emit("close", 0);
    });

    await collectEvents(iter);

    expect(child.stdin.write).toHaveBeenCalledWith("stdin content");
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it("passes correct cwd and env to spawn", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new TestRuntime({
      command: "my-cmd",
      buildArgs: () => ["--arg1"],
      buildEnv: () => ({ CUSTOM_VAR: "value" }),
    });

    const iter = runtime.execute(defaultParams({ workspaceDir: "/my/dir" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    expect(spawnMock).toHaveBeenCalledWith("my-cmd", ["--arg1"], {
      cwd: "/my/dir",
      env: expect.objectContaining({ CUSTOM_VAR: "value" }),
      stdio: ["pipe", "pipe", "pipe"],
    });
  });

  describe("no-output watchdog", () => {
    it("kills process that produces no output before watchdog fires", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new WatchdogTestRuntime(50);
      const iter = runtime.execute(defaultParams());

      // Let the watchdog fire (50ms), then close after kill
      setTimeout(() => {
        child.emit("close", null);
      }, 100);

      const events = await collectEvents(iter);
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toEqual({
        type: "error",
        message: "No output for 50ms (watchdog)",
        category: "timeout",
      });
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.type === "done" && doneEvent.result.aborted).toBe(true);
    });

    it("does not kill process that streams output continuously", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new WatchdogTestRuntime(80);
      const iter = runtime.execute(defaultParams());

      // Emit output every 30ms (well within 80ms watchdog), then close
      const interval = setInterval(() => {
        child.stdout.emit("data", Buffer.from("ping\n"));
      }, 30);

      setTimeout(() => {
        clearInterval(interval);
        child.emit("close", 0);
      }, 200);

      const events = await collectEvents(iter);
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toBeUndefined();

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.type === "done" && doneEvent.result.aborted).toBe(false);
    });

    it("does not activate watchdog when resolveWatchdogMs returns undefined", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new WatchdogTestRuntime(undefined);
      const iter = runtime.execute(defaultParams());

      // Close immediately with no output — no watchdog error expected
      queueMicrotask(() => {
        child.emit("close", 0);
      });

      const events = await collectEvents(iter);
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toBeUndefined();
    });

    it("clears watchdog timer on process exit", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new WatchdogTestRuntime(100);
      const iter = runtime.execute(defaultParams());

      // Emit some output then close quickly (before watchdog fires)
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from("output\n"));
        child.emit("close", 0);
      });

      const events = await collectEvents(iter);
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toBeUndefined();

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.type === "done" && doneEvent.result.aborted).toBe(false);
    });

    it("watchdog fires before overall timeout", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      // Watchdog at 50ms, overall timeout at 500ms
      const runtime = new WatchdogTestRuntime(50);
      const iter = runtime.execute(defaultParams({ timeoutMs: 500 }));

      setTimeout(() => {
        child.emit("close", null);
      }, 100);

      const events = await collectEvents(iter);
      const errEvent = events.find((e) => e.type === "error");
      // Should be watchdog error, not overall timeout
      expect(errEvent).toEqual({
        type: "error",
        message: "No output for 50ms (watchdog)",
        category: "timeout",
      });
    });
  });
});
