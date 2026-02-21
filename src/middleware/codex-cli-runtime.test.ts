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

const { CodexCliRuntime } = await import("./codex-cli-runtime.js");

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

describe("CodexCliRuntime", () => {
  afterEach(() => {
    spawnMock.mockClear();
  });

  it("has correct runtime name", () => {
    const runtime = new CodexCliRuntime();
    expect(runtime.name).toBe("codex-cli");
  });

  it("builds basic args with exec subcommand and prompt", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new CodexCliRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "--json", "--color", "never", "hello"],
      expect.objectContaining({ cwd: "/workspace" }),
    );
  });

  it("includes -m when model is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new CodexCliRuntime();
    const iter = runtime.execute(defaultParams({ model: "gpt-5-codex" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("-m");
    expect(args[args.indexOf("-m") + 1]).toBe("gpt-5-codex");
  });

  it("builds resume args with positional verb", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new CodexCliRuntime();
    const iter = runtime.execute(
      defaultParams({ sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53" }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    // Should be: exec resume <sessionId> --json --color never
    expect(args[0]).toBe("exec");
    expect(args[1]).toBe("resume");
    expect(args[2]).toBe("0199a213-81c0-7800-8aa1-bbab2a035a53");
    expect(args).toContain("--json");
    // Resume should NOT include the prompt
    expect(args).not.toContain("hello");
  });

  it("sets OPENAI_API_KEY env for api-key auth mode", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new CodexCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { apiKey: "sk-openai-test", source: "profile:test", mode: "api-key" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.OPENAI_API_KEY).toBe("sk-openai-test");
  });

  it("clears ANTHROPIC_API_KEY from inherited env", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const origVal = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "should-be-gone";

    try {
      const runtime = new CodexCliRuntime();
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.ANTHROPIC_API_KEY).toBeUndefined();
    } finally {
      if (origVal === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = origVal;
      }
    }
  });

  it("does not explicitly set OPENAI_API_KEY when no auth provided", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    // Clear OPENAI_API_KEY from parent env to isolate test
    const origVal = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const runtime = new CodexCliRuntime();
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.OPENAI_API_KEY).toBeUndefined();
    } finally {
      if (origVal === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = origVal;
      }
    }
  });

  it("parses Codex NDJSON events via overridden parseLine", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new CodexCliRuntime();
    const iter = runtime.execute(defaultParams());
    const eventsPromise = collectEvents(iter);

    // Emit Codex NDJSON lines
    const threadLine = JSON.stringify({
      type: "thread.started",
      thread_id: "thread-abc",
    });
    const textLine = JSON.stringify({
      type: "item.completed",
      item: { id: "item_1", type: "agent_message", text: "Hello from Codex" },
    });
    const usageLine = JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    child.stdout.emit("data", Buffer.from(`${threadLine}\n${textLine}\n${usageLine}\n`));
    child.emit("close", 0);

    const events = await eventsPromise;
    const textEvent = events.find((e) => e.type === "text");
    expect(textEvent).toEqual({ type: "text", text: "Hello from Codex" });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === "done") {
      expect(doneEvent.result.sessionId).toBe("thread-abc");
      expect(doneEvent.result.usage?.inputTokens).toBe(100);
      expect(doneEvent.result.usage?.outputTokens).toBe(50);
      expect(doneEvent.result.text).toBe("Hello from Codex");
    }
  });

  describe("CliBackendConfig injection", () => {
    it("uses config.command instead of default", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new CodexCliRuntime({ command: "/usr/local/bin/codex" });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      expect(spawnMock.mock.calls[0][0]).toBe("/usr/local/bin/codex");
    });

    it("places config.args between intrinsic and per-invocation args", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new CodexCliRuntime({
        command: "codex",
        args: ["--sandbox", "read-only", "--skip-git-repo-check"],
      });
      const iter = runtime.execute(defaultParams({ model: "gpt-5-codex" }));

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const args = spawnMock.mock.calls[0][1] as string[];
      // Intrinsic: exec --json --color never
      // Config: --sandbox read-only --skip-git-repo-check
      // Per-invocation: -m gpt-5-codex
      // Prompt: hello
      expect(args.indexOf("--color")).toBeLessThan(args.indexOf("--sandbox"));
      expect(args.indexOf("--sandbox")).toBeLessThan(args.indexOf("-m"));
      expect(args.indexOf("-m")).toBeLessThan(args.indexOf("hello"));
    });

    it("merges config.env into runtime env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new CodexCliRuntime({
        command: "codex",
        env: { CODEX_API_KEY: "ck-test", EXTRA: "extra" },
      });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.CODEX_API_KEY).toBe("ck-test");
      expect(opts.env.EXTRA).toBe("extra");
    });

    it("clearEnv strips vars from inherited process env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const origVal = process.env.TEST_CLEAR_ME;
      process.env.TEST_CLEAR_ME = "should-be-gone";

      try {
        const runtime = new CodexCliRuntime({
          command: "codex",
          clearEnv: ["TEST_CLEAR_ME"],
        });
        const iter = runtime.execute(defaultParams());

        queueMicrotask(() => child.emit("close", 0));
        await collectEvents(iter);

        const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
        expect(opts.env.TEST_CLEAR_ME).toBeUndefined();
      } finally {
        if (origVal === undefined) {
          delete process.env.TEST_CLEAR_ME;
        } else {
          process.env.TEST_CLEAR_ME = origVal;
        }
      }
    });

    it("preserves defaults when no config provided", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new CodexCliRuntime();
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      expect(spawnMock.mock.calls[0][0]).toBe("codex");

      const args = spawnMock.mock.calls[0][1] as string[];
      expect(args).toEqual(["exec", "--json", "--color", "never", "hello"]);
    });
  });

  describe("no-output watchdog", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("activates watchdog using default profile without backend config", async () => {
      vi.useFakeTimers();
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new CodexCliRuntime();
      const iter = runtime.execute(defaultParams({ timeoutMs: 300_000 }));
      const eventsPromise = collectEvents(iter);

      // Default fresh ratio: 0.8 * 300_000 = 240_000, clamped to [180_000, 600_000]
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

    it("resets watchdog on stdout output", async () => {
      vi.useFakeTimers();
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new CodexCliRuntime({
        command: "codex",
        reliability: {
          watchdog: {
            fresh: { noOutputTimeoutMs: 5_000 },
          },
        },
      });
      const iter = runtime.execute(defaultParams({ timeoutMs: 300_000 }));
      const eventsPromise = collectEvents(iter);

      // Emit output at 3s (resets the 5s watchdog)
      await vi.advanceTimersByTimeAsync(3_000);
      child.stdout.emit("data", Buffer.from("output\n"));

      // Close at 6s — within the reset window
      await vi.advanceTimersByTimeAsync(3_000);
      child.emit("close", 0);

      const events = await eventsPromise;
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toBeUndefined();
    });
  });
});
