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
  child.kill = vi.fn();
  return child;
}

const spawnMock = vi.fn<(...args: unknown[]) => MockChild>();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { GeminiCliRuntime } = await import("./gemini-cli-runtime.js");

function defaultParams(overrides?: Partial<AgentRuntimeParams>): AgentRuntimeParams {
  return {
    prompt: "hello",
    sessionId: undefined,
    workspaceDir: "/workspace",
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

describe("GeminiCliRuntime", () => {
  afterEach(() => {
    spawnMock.mockClear();
  });

  it("has correct runtime name", () => {
    const runtime = new GeminiCliRuntime();
    expect(runtime.name).toBe("google-gemini-cli");
  });

  it("builds args with prompt via -p flag", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    expect(spawnMock).toHaveBeenCalledWith(
      "gemini",
      ["--output-format", "stream-json", "-p", "hello"],
      expect.objectContaining({ cwd: "/workspace" }),
    );
  });

  it("includes -m when model is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams({ model: "gemini-2.5-flash" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("-m");
    expect(args[args.indexOf("-m") + 1]).toBe("gemini-2.5-flash");
  });

  it("includes --max-turns when maxTurns is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams({ maxTurns: 10 }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("10");
  });

  it("includes -r when sessionId is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams({ sessionId: "my-session" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("-r");
    expect(args[args.indexOf("-r") + 1]).toBe("my-session");
  });

  it("sets GEMINI_API_KEY for api-key auth", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { apiKey: "AIza-test-key", source: "profile:test", mode: "api-key" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.GEMINI_API_KEY).toBe("AIza-test-key");
  });

  it("does not set auth env vars for token mode (inherits from parent)", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    // Clear GEMINI_API_KEY from parent env so inherited env doesn't leak
    const origKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const runtime = new GeminiCliRuntime();
      const iter = runtime.execute(
        defaultParams({
          auth: { apiKey: "gcp-tok", source: "profile:gcp", mode: "token" },
        }),
      );

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.GEMINI_API_KEY).toBeUndefined();
    } finally {
      if (origKey !== undefined) {
        process.env.GEMINI_API_KEY = origKey;
      }
    }
  });

  it("sets no env vars when auth is not provided", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    // Clear GEMINI_API_KEY from parent env so inherited env doesn't leak
    const origKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const runtime = new GeminiCliRuntime();
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.GEMINI_API_KEY).toBeUndefined();
    } finally {
      if (origKey !== undefined) {
        process.env.GEMINI_API_KEY = origKey;
      }
    }
  });

  it("does not send prompt via stdin", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams({ prompt: "x".repeat(50_000) }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    // Large prompt should still be in args via -p, not stdin
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("-p");
    expect(child.stdin.write).not.toHaveBeenCalled();
  });

  it("parses Gemini NDJSON events from stdout", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams());
    const eventsPromise = collectEvents(iter);

    // Simulate Gemini NDJSON output
    child.stdout.emit(
      "data",
      Buffer.from(
        [
          JSON.stringify({ type: "init", sessionId: "gemini-session-1" }),
          JSON.stringify({ type: "message", content: "Hello!" }),
        ].join("\n") + "\n",
      ),
    );

    queueMicrotask(() => child.emit("close", 0));
    const events = await eventsPromise;

    const textEvent = events.find((e) => e.type === "text");
    expect(textEvent).toEqual({ type: "text", text: "Hello!" });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === "done") {
      expect(doneEvent.result.sessionId).toBe("gemini-session-1");
    }
  });

  it("extracts usage from result event", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams());
    const eventsPromise = collectEvents(iter);

    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          type: "result",
          response: "Done",
          stats: {
            models: {
              "gemini-2.5-flash": {
                tokens: { prompt: 500, candidates: 100, total: 600, cached: 50, thoughts: 10 },
              },
            },
            tools: { totalCalls: 2 },
          },
        }) + "\n",
      ),
    );

    queueMicrotask(() => child.emit("close", 0));
    const events = await eventsPromise;

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === "done") {
      expect(doneEvent.result.usage).toEqual({
        inputTokens: 500,
        outputTokens: 100,
        cacheReadTokens: 50,
        cacheWriteTokens: undefined,
      });
      expect(doneEvent.result.numTurns).toBe(2);
    }
  });

  it("handles exit code 53 as turn limit exceeded", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams());
    const eventsPromise = collectEvents(iter);

    queueMicrotask(() => child.emit("close", 53));
    const events = await eventsPromise;

    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toEqual({
      type: "error",
      message: "Turn limit exceeded (exit code 53)",
      category: "fatal",
    });
  });

  it("uses stderr text in exit code 53 error when available", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new GeminiCliRuntime();
    const iter = runtime.execute(defaultParams());
    const eventsPromise = collectEvents(iter);

    child.stderr.emit("data", Buffer.from("Max turns (5) exceeded"));
    queueMicrotask(() => child.emit("close", 53));
    const events = await eventsPromise;

    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toEqual({
      type: "error",
      message: "Max turns (5) exceeded",
      category: "fatal",
    });
  });

  describe("CliBackendConfig injection", () => {
    it("uses config.command instead of default", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new GeminiCliRuntime({ command: "/usr/local/bin/gemini" });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      expect(spawnMock.mock.calls[0][0]).toBe("/usr/local/bin/gemini");
    });

    it("places config.args between intrinsic and per-invocation args", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new GeminiCliRuntime({
        command: "gemini",
        args: ["--sandbox", "true"],
      });
      const iter = runtime.execute(defaultParams({ model: "gemini-2.5-pro" }));

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const args = spawnMock.mock.calls[0][1] as string[];
      // Intrinsic args come first
      expect(args.indexOf("stream-json")).toBeLessThan(args.indexOf("--sandbox"));
      // Config args before per-invocation args
      expect(args.indexOf("--sandbox")).toBeLessThan(args.indexOf("-m"));
      // Per-invocation args before prompt
      expect(args.indexOf("-m")).toBeLessThan(args.indexOf("-p"));
    });

    it("merges config.env into runtime env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new GeminiCliRuntime({
        command: "gemini",
        env: { GOOGLE_CLOUD_PROJECT: "my-project", GOOGLE_CLOUD_LOCATION: "us-central1" },
      });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.GOOGLE_CLOUD_PROJECT).toBe("my-project");
      expect(opts.env.GOOGLE_CLOUD_LOCATION).toBe("us-central1");
    });

    it("clearEnv strips vars from inherited process env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const origVal = process.env.TEST_GEMINI_CLEAR;
      process.env.TEST_GEMINI_CLEAR = "should-be-gone";

      try {
        const runtime = new GeminiCliRuntime({
          command: "gemini",
          clearEnv: ["TEST_GEMINI_CLEAR"],
        });
        const iter = runtime.execute(defaultParams());

        queueMicrotask(() => child.emit("close", 0));
        await collectEvents(iter);

        const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
        expect(opts.env.TEST_GEMINI_CLEAR).toBeUndefined();
      } finally {
        if (origVal === undefined) {
          delete process.env.TEST_GEMINI_CLEAR;
        } else {
          process.env.TEST_GEMINI_CLEAR = origVal;
        }
      }
    });
  });

  describe("no-output watchdog", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("activates watchdog using default profile", async () => {
      vi.useFakeTimers();
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      // Fresh ratio 0.8 * 300_000 = 240_000, clamped to [180_000, 600_000] = 240_000
      const runtime = new GeminiCliRuntime();
      const iter = runtime.execute(defaultParams({ timeoutMs: 300_000 }));
      const eventsPromise = collectEvents(iter);

      await vi.advanceTimersByTimeAsync(240_500);
      child.emit("close", null);

      const events = await eventsPromise;
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toEqual({
        type: "error",
        message: "No output for 240000ms (watchdog)",
        category: "timeout",
      });
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    });
  });
});
