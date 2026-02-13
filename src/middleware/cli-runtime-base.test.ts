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
          },
          aborted: false,
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
});
