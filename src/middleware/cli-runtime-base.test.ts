import EventEmitter from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIRuntimeBase } from "./cli-runtime-base.js";
import type { AgentEvent, AgentExecuteParams } from "./types.js";

// ── Test harness ─────────────────────────────────────────────────────────

/** Minimal mock ChildProcess with controllable stdio streams. */
function createMockChild() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const proc = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.stdin = stdin;
  proc.pid = 12345;
  proc.kill = vi.fn(() => {
    stdout.end();
    proc.emit("exit", null, "SIGTERM");
  });
  return proc;
}

/** Concrete test subclass of CLIRuntimeBase. */
class TestRuntime extends CLIRuntimeBase {
  protected buildArgs(_params: AgentExecuteParams): string[] {
    return ["--test"];
  }

  protected extractEvent(line: string): AgentEvent | null {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed["type"] === "text" && typeof parsed["text"] === "string") {
      return { type: "text", text: parsed["text"] };
    }
    if (parsed["type"] === "error" && typeof parsed["message"] === "string") {
      return {
        type: "error",
        message: parsed["message"],
        code: typeof parsed["code"] === "string" ? parsed["code"] : undefined,
      };
    }
    return null;
  }

  protected buildEnv(_params: AgentExecuteParams): Record<string, string> {
    return { TEST_VAR: "1" };
  }
}

/** Collect all events from the async iterable. */
async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

const defaultParams: AgentExecuteParams = {
  prompt: "hello",
};

// ── Tests ────────────────────────────────────────────────────────────────

let mockChild: ReturnType<typeof createMockChild>;
let spawnMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  mockChild = createMockChild();
  spawnMock = vi.fn().mockReturnValue(mockChild);
  vi.mock("node:child_process", () => ({
    spawn: (...args: unknown[]) => (spawnMock as (...a: unknown[]) => unknown)(...args),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CLIRuntimeBase", () => {
  describe("NDJSON parsing", () => {
    it("yields events from valid NDJSON lines", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      // Emit NDJSON lines and close.
      mockChild.stdout.write('{"type":"text","text":"hello"}\n');
      mockChild.stdout.write('{"type":"text","text":"world"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      expect(events).toEqual([
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
        { type: "done", result: expect.objectContaining({ aborted: false }) },
      ]);
    });

    it("skips malformed JSON lines without failing", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.write("not valid json\n");
      mockChild.stdout.write('{"type":"text","text":"ok"}\n');
      mockChild.stdout.write("another bad line\n");
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      expect(events).toEqual([
        { type: "text", text: "ok" },
        { type: "done", result: expect.objectContaining({ aborted: false }) },
      ]);
    });

    it("skips empty lines", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.write("\n");
      mockChild.stdout.write("   \n");
      mockChild.stdout.write('{"type":"text","text":"x"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      expect(events).toEqual([
        { type: "text", text: "x" },
        { type: "done", result: expect.objectContaining({ aborted: false }) },
      ]);
    });

    it("skips lines where extractEvent returns null", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      // Valid JSON but extractEvent returns null for unknown types.
      mockChild.stdout.write('{"type":"unknown","data":123}\n');
      mockChild.stdout.write('{"type":"text","text":"ok"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      expect(events).toEqual([
        { type: "text", text: "ok" },
        { type: "done", result: expect.objectContaining({ aborted: false }) },
      ]);
    });
  });

  describe("abort signal propagation", () => {
    it("kills child process when abort signal fires", async () => {
      const runtime = new TestRuntime("test-cli");
      const controller = new AbortController();

      const promise = collectEvents(
        runtime.execute({ ...defaultParams, abortSignal: controller.signal }),
      );

      // Abort after some output.
      mockChild.stdout.write('{"type":"text","text":"before"}\n');
      controller.abort();

      const events = await promise;

      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(events).toContainEqual(expect.objectContaining({ type: "error", code: "ABORTED" }));
      expect(events[events.length - 1]).toEqual(
        expect.objectContaining({
          type: "done",
          result: expect.objectContaining({ aborted: true }),
        }),
      );
    });

    it("kills immediately if signal already aborted", async () => {
      const runtime = new TestRuntime("test-cli");
      const controller = new AbortController();
      controller.abort();

      const promise = collectEvents(
        runtime.execute({ ...defaultParams, abortSignal: controller.signal }),
      );

      const events = await promise;

      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(events).toContainEqual(expect.objectContaining({ type: "error", code: "ABORTED" }));
    });
  });

  describe("watchdog timer", () => {
    it("kills child process after inactivity timeout", async () => {
      const runtime = new TestRuntime("test-cli", 1000);

      const promise = collectEvents(runtime.execute(defaultParams));

      // Advance past the watchdog timeout with no output.
      await vi.advanceTimersByTimeAsync(1001);

      const events = await promise;

      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(events).toContainEqual(
        expect.objectContaining({ type: "error", code: "WATCHDOG_TIMEOUT" }),
      );
    });

    it("resets on each NDJSON line", async () => {
      const runtime = new TestRuntime("test-cli", 1000);

      const promise = collectEvents(runtime.execute(defaultParams));

      // Emit a line at 800ms — should reset the watchdog.
      await vi.advanceTimersByTimeAsync(800);
      mockChild.stdout.write('{"type":"text","text":"alive"}\n');

      // Advance another 800ms (total 1600ms, but only 800ms since last line).
      await vi.advanceTimersByTimeAsync(800);
      // Watchdog should NOT have fired yet.
      expect(mockChild.kill).not.toHaveBeenCalled();

      // Now advance past the remaining 200ms of the watchdog.
      await vi.advanceTimersByTimeAsync(201);

      const events = await promise;

      // We should have the text event, then the watchdog error, then done.
      expect(events[0]).toEqual({ type: "text", text: "alive" });
      expect(events).toContainEqual(
        expect.objectContaining({ type: "error", code: "WATCHDOG_TIMEOUT" }),
      );
    });
  });

  describe("stdin prompt delivery", () => {
    it("writes long prompts to stdin", async () => {
      const runtime = new TestRuntime("test-cli");
      const longPrompt = "x".repeat(10_001);

      const stdinChunks: string[] = [];
      let stdinEnded = false;
      mockChild.stdin.on("data", (chunk: Buffer) => {
        stdinChunks.push(chunk.toString());
      });
      mockChild.stdin.on("end", () => {
        stdinEnded = true;
      });

      const promise = collectEvents(runtime.execute({ ...defaultParams, prompt: longPrompt }));

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      expect(stdinChunks.join("")).toBe(longPrompt);
      expect(stdinEnded).toBe(true);
    });

    it("does not write short prompts to stdin but still closes it", async () => {
      const runtime = new TestRuntime("test-cli");
      const shortPrompt = "x".repeat(9_999);

      const stdinSpy = vi.spyOn(mockChild.stdin, "write");
      const endSpy = vi.spyOn(mockChild.stdin, "end");

      const promise = collectEvents(runtime.execute({ ...defaultParams, prompt: shortPrompt }));

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      expect(stdinSpy).not.toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe("subprocess spawning", () => {
    it("passes command and args to spawn", async () => {
      const runtime = new TestRuntime("my-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      expect(spawnMock).toHaveBeenCalledWith(
        "my-cli",
        ["--test"],
        expect.objectContaining({
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    });

    it("sets working directory from params", async () => {
      const runtime = new TestRuntime("my-cli");

      const promise = collectEvents(
        runtime.execute({ ...defaultParams, workingDirectory: "/some/dir" }),
      );

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      expect(spawnMock).toHaveBeenCalledWith(
        "my-cli",
        expect.any(Array),
        expect.objectContaining({ cwd: "/some/dir" }),
      );
    });

    it("merges buildEnv and params.env into spawn environment", async () => {
      const runtime = new TestRuntime("my-cli");

      const promise = collectEvents(runtime.execute({ ...defaultParams, env: { EXTRA: "yes" } }));

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      const spawnEnv = spawnMock.mock.calls[0]?.[2]?.env as Record<string, string>;
      expect(spawnEnv).toMatchObject({ TEST_VAR: "1", EXTRA: "yes" });
    });
  });

  describe("stderr capture", () => {
    it("captures stderr without failing", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stderr.write("some warning\n");
      mockChild.stderr.write("another warning\n");
      mockChild.stdout.write('{"type":"text","text":"ok"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      // Stderr should not produce error events — it's just captured.
      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toHaveLength(0);
      expect(events[0]).toEqual({ type: "text", text: "ok" });
    });
  });

  describe("done event", () => {
    it("includes duration in result", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      // Advance time to simulate duration.
      await vi.advanceTimersByTimeAsync(500);
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;
      const done = events.find((e) => e.type === "done");

      expect(done).toBeDefined();
      expect(done!.type === "done" && done!.result.durationMs).toBeGreaterThanOrEqual(500);
    });

    it("always emits done as the final event", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.write('{"type":"text","text":"a"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;
      const last = events[events.length - 1];

      expect(last.type).toBe("done");
    });
  });
});
