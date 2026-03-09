import EventEmitter from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIRuntimeBase } from "./cli-runtime-base.js";
import type { AgentEvent, AgentExecuteParams } from "./types.js";

// ── Test harness ─────────────────────────────────────────────────────────

/** Minimal mock ChildProcess with controllable stdio streams. */
function createMockChild({ exitOnKill = true }: { exitOnKill?: boolean } = {}) {
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
  proc.kill = exitOnKill
    ? vi.fn(() => {
        stdout.end();
        proc.emit("exit", null, "SIGTERM");
      })
    : vi.fn();
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

  public testComposePrompt(params: AgentExecuteParams): string {
    return this.composePrompt(params);
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

  describe("startup timeout", () => {
    it("kills child process when no output arrives before deadline", async () => {
      const runtime = new TestRuntime("test-cli", 1000);

      const promise = collectEvents(runtime.execute(defaultParams));

      // Advance past the startup timeout with no output.
      await vi.advanceTimersByTimeAsync(1001);

      const events = await promise;

      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(events).toContainEqual(
        expect.objectContaining({ type: "error", code: "STARTUP_TIMEOUT" }),
      );
    });

    it("does not fire after the first NDJSON line is received", async () => {
      const runtime = new TestRuntime("test-cli", 1000);

      const promise = collectEvents(runtime.execute(defaultParams));

      // Emit a line at 500ms — cancels the startup timer.
      await vi.advanceTimersByTimeAsync(500);
      mockChild.stdout.write('{"type":"text","text":"alive"}\n');

      // Advance well past the original deadline — no timeout should fire.
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockChild.kill).not.toHaveBeenCalled();

      // Close cleanly.
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      expect(events[0]).toEqual({ type: "text", text: "alive" });
      expect(events).not.toContainEqual(
        expect.objectContaining({ type: "error", code: "STARTUP_TIMEOUT" }),
      );
    });
  });

  describe("SIGKILL escalation", () => {
    it("sends SIGKILL after SIGTERM if process does not exit (startup timeout)", async () => {
      const stubbornChild = createMockChild({ exitOnKill: false });
      spawnMock.mockReturnValue(stubbornChild);

      const runtime = new TestRuntime("test-cli", 1000);
      const promise = collectEvents(runtime.execute(defaultParams));

      // Advance past startup timeout → SIGTERM sent.
      await vi.advanceTimersByTimeAsync(1001);
      expect(stubbornChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(stubbornChild.kill).not.toHaveBeenCalledWith("SIGKILL");

      // Advance past SIGKILL escalation timeout.
      await vi.advanceTimersByTimeAsync(1500);
      expect(stubbornChild.kill).toHaveBeenCalledWith("SIGKILL");

      // Clean up: force process exit.
      stubbornChild.stdout.end();
      stubbornChild.emit("exit", null, "SIGKILL");

      const events = await promise;
      expect(events).toContainEqual(
        expect.objectContaining({ type: "error", code: "STARTUP_TIMEOUT" }),
      );
    });

    it("cancels SIGKILL timer if process exits after SIGTERM (startup timeout)", async () => {
      const stubbornChild = createMockChild({ exitOnKill: false });
      spawnMock.mockReturnValue(stubbornChild);

      const runtime = new TestRuntime("test-cli", 1000);
      const promise = collectEvents(runtime.execute(defaultParams));

      // Advance past startup timeout → SIGTERM.
      await vi.advanceTimersByTimeAsync(1001);
      expect(stubbornChild.kill).toHaveBeenCalledWith("SIGTERM");

      // Process exits gracefully before escalation.
      stubbornChild.stdout.end();
      stubbornChild.emit("exit", 0, "SIGTERM");

      // Advance past when SIGKILL would have fired.
      await vi.advanceTimersByTimeAsync(2000);

      const events = await promise;
      expect(stubbornChild.kill).not.toHaveBeenCalledWith("SIGKILL");
      expect(events).toContainEqual(
        expect.objectContaining({ type: "error", code: "STARTUP_TIMEOUT" }),
      );
    });

    it("sends SIGKILL after SIGTERM if process does not exit (abort)", async () => {
      const stubbornChild = createMockChild({ exitOnKill: false });
      spawnMock.mockReturnValue(stubbornChild);

      const runtime = new TestRuntime("test-cli");
      const controller = new AbortController();

      const promise = collectEvents(
        runtime.execute({ ...defaultParams, abortSignal: controller.signal }),
      );

      // Abort → SIGTERM sent.
      controller.abort();
      expect(stubbornChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(stubbornChild.kill).not.toHaveBeenCalledWith("SIGKILL");

      // Advance past SIGKILL escalation timeout.
      await vi.advanceTimersByTimeAsync(1500);
      expect(stubbornChild.kill).toHaveBeenCalledWith("SIGKILL");

      // Clean up: force process exit.
      stubbornChild.stdout.end();
      stubbornChild.emit("exit", null, "SIGKILL");

      const events = await promise;
      expect(events).toContainEqual(expect.objectContaining({ type: "error", code: "ABORTED" }));
    });

    it("cancels SIGKILL timer if process exits after SIGTERM (abort)", async () => {
      const stubbornChild = createMockChild({ exitOnKill: false });
      spawnMock.mockReturnValue(stubbornChild);

      const runtime = new TestRuntime("test-cli");
      const controller = new AbortController();

      const promise = collectEvents(
        runtime.execute({ ...defaultParams, abortSignal: controller.signal }),
      );

      // Abort → SIGTERM.
      controller.abort();
      expect(stubbornChild.kill).toHaveBeenCalledWith("SIGTERM");

      // Process exits gracefully before escalation.
      stubbornChild.stdout.end();
      stubbornChild.emit("exit", 0, "SIGTERM");

      // Advance past when SIGKILL would have fired.
      await vi.advanceTimersByTimeAsync(2000);

      await promise;
      expect(stubbornChild.kill).not.toHaveBeenCalledWith("SIGKILL");
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

    it("appends extraArgs after buildArgs output", async () => {
      const runtime = new TestRuntime("my-cli");

      const promise = collectEvents(
        runtime.execute({ ...defaultParams, extraArgs: ["--extra-flag", "--another"] }),
      );

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      expect(spawnMock).toHaveBeenCalledWith(
        "my-cli",
        ["--test", "--extra-flag", "--another"],
        expect.any(Object),
      );
    });

    it("does not modify args when extraArgs is undefined", async () => {
      const runtime = new TestRuntime("my-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      expect(spawnMock).toHaveBeenCalledWith("my-cli", ["--test"], expect.any(Object));
    });

    it("does not modify args when extraArgs is empty", async () => {
      const runtime = new TestRuntime("my-cli");

      const promise = collectEvents(runtime.execute({ ...defaultParams, extraArgs: [] }));

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      await promise;

      expect(spawnMock).toHaveBeenCalledWith("my-cli", ["--test"], expect.any(Object));
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
    it("captures stderr without error event on success exit with output", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stderr.write("some warning\n");
      mockChild.stderr.write("another warning\n");
      mockChild.stdout.write('{"type":"text","text":"ok"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      // Stderr should not produce error events when exit 0 + events yielded.
      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toHaveLength(0);
      expect(events[0]).toEqual({ type: "text", text: "ok" });
    });

    it("includes stderr in done result when present", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stderr.write("some warning\n");
      mockChild.stdout.write('{"type":"text","text":"ok"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;
      const done = events.find((e) => e.type === "done");

      expect(done).toBeDefined();
      expect(done!.type === "done" && done!.result.stderr).toBe("some warning\n");
    });

    it("emits error event when CLI exits non-zero with stderr", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stderr.write("Not logged in · Please run /login\n");
      mockChild.stdout.end();
      mockChild.emit("exit", 1, null);

      const events = await promise;

      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toContainEqual({
        type: "error",
        message: "Not logged in · Please run /login",
        code: "CLI_STDERR",
      });

      const done = events.find((e) => e.type === "done");
      expect(done!.type === "done" && done!.result.stderr).toBe(
        "Not logged in · Please run /login\n",
      );
    });

    it("emits error event when CLI exits zero with stderr but no NDJSON output", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stderr.write("Unexpected error occurred\n");
      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toContainEqual({
        type: "error",
        message: "Unexpected error occurred",
        code: "CLI_STDERR",
      });
    });

    it("does not emit CLI_STDERR error when no stderr content on non-zero exit", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.end();
      mockChild.emit("exit", 1, null);

      const events = await promise;

      const stderrErrors = events.filter(
        (e) => e.type === "error" && "code" in e && e.code === "CLI_STDERR",
      );
      expect(stderrErrors).toHaveLength(0);
    });

    it("emits CLI_EXIT_ERROR when non-zero exit with no stderr and no NDJSON output", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.end();
      mockChild.emit("exit", 1, null);

      const events = await promise;

      expect(events).toContainEqual({
        type: "error",
        message: "Agent process exited with code 1",
        code: "CLI_EXIT_ERROR",
      });
    });

    it("does not emit CLI_EXIT_ERROR when non-zero exit has NDJSON output", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.write('{"type":"text","text":"partial"}\n');
      mockChild.stdout.end();
      mockChild.emit("exit", 1, null);

      const events = await promise;

      const exitErrors = events.filter(
        (e) => e.type === "error" && "code" in e && e.code === "CLI_EXIT_ERROR",
      );
      expect(exitErrors).toHaveLength(0);
    });

    it("does not emit CLI_EXIT_ERROR on zero exit with no output", async () => {
      const runtime = new TestRuntime("test-cli");

      const promise = collectEvents(runtime.execute(defaultParams));

      mockChild.stdout.end();
      mockChild.emit("exit", 0, null);

      const events = await promise;

      const exitErrors = events.filter(
        (e) => e.type === "error" && "code" in e && e.code === "CLI_EXIT_ERROR",
      );
      expect(exitErrors).toHaveLength(0);
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

  describe("composePrompt thread context gating", () => {
    it("includes threadContext on new sessions (no sessionId)", () => {
      const runtime = new TestRuntime("test-cli");
      const result = runtime.testComposePrompt({
        prompt: "hello",
        systemPrompt: "system",
        threadContext: "[Thread history - for context]\nAlice: Hi",
      });
      expect(result).toBe("system\n\n[Thread history - for context]\nAlice: Hi\n\nhello");
    });

    it("excludes threadContext on resume (sessionId set)", () => {
      const runtime = new TestRuntime("test-cli");
      const result = runtime.testComposePrompt({
        prompt: "hello",
        systemPrompt: "system",
        sessionId: "sess-123",
        threadContext: "[Thread history - for context]\nAlice: Hi",
      });
      expect(result).toBe("system\n\nhello");
    });

    it("includes threadContext between extraContext and prompt", () => {
      const runtime = new TestRuntime("test-cli");
      const result = runtime.testComposePrompt({
        prompt: "hello",
        systemPrompt: "system",
        extraContext: "extra",
        threadContext: "[Thread starter - for context]\nAlice: Hi",
      });
      expect(result).toBe("system\n\nextra\n\n[Thread starter - for context]\nAlice: Hi\n\nhello");
    });

    it("includes threadContext alone when no systemPrompt or extraContext", () => {
      const runtime = new TestRuntime("test-cli");
      const result = runtime.testComposePrompt({
        prompt: "hello",
        threadContext: "[Thread starter - for context]\nAlice: Hi",
      });
      expect(result).toBe("[Thread starter - for context]\nAlice: Hi\n\nhello");
    });
  });
});
