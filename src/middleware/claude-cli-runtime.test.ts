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

const { ClaudeCliRuntime } = await import("./claude-cli-runtime.js");

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

describe("ClaudeCliRuntime", () => {
  afterEach(() => {
    spawnMock.mockClear();
  });

  it("builds basic args with short prompt as positional", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    expect(spawnMock).toHaveBeenCalledWith(
      "claude",
      [
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        "hello",
      ],
      expect.objectContaining({ cwd: "/workspace" }),
    );
  });

  it("sets CLAUDECODE env when no auth provided", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.CLAUDECODE).toBe("");
  });

  it("sets ANTHROPIC_API_KEY env for api-key auth mode", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { apiKey: "sk-test-key", source: "profile:test", mode: "api-key" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.ANTHROPIC_API_KEY).toBe("sk-test-key");
    expect(opts.env.CLAUDECODE).toBe("");
  });

  it("sets CLAUDE_CODE_OAUTH_TOKEN env for token auth mode", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { apiKey: "some-token", source: "profile:token", mode: "token" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("some-token");
  });

  it("sets empty env for aws-sdk auth mode", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { source: "aws-sdk default chain", mode: "aws-sdk" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(opts.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(opts.env.CLAUDECODE).toBe("");
  });

  it("includes --model when model is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(defaultParams({ model: "sonnet" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  });

  it("includes --resume when sessionId is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(defaultParams({ sessionId: "s-abc" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--resume");
    expect(args[args.indexOf("--resume") + 1]).toBe("s-abc");
  });

  it("includes --max-turns when maxTurns is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(defaultParams({ maxTurns: 5 }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("5");
  });

  it("sends long prompt via stdin instead of positional arg", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const longPrompt = "x".repeat(15_000);
    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(defaultParams({ prompt: longPrompt }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    // Prompt should NOT be in args
    expect(args).not.toContain(longPrompt);
    // Should be written to stdin
    expect(child.stdin.write).toHaveBeenCalledWith(longPrompt);
  });

  it("has correct runtime name", () => {
    const runtime = new ClaudeCliRuntime();
    expect(runtime.name).toBe("claude-cli");
  });

  describe("CliBackendConfig injection", () => {
    it("uses config.command instead of default", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new ClaudeCliRuntime({ command: "/usr/local/bin/claude" });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      expect(spawnMock.mock.calls[0][0]).toBe("/usr/local/bin/claude");
    });

    it("places config.args between intrinsic and per-invocation args", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new ClaudeCliRuntime({
        command: "claude",
        args: ["--allowedTools", "Bash(git:*)"],
      });
      const iter = runtime.execute(defaultParams({ model: "sonnet" }));

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const args = spawnMock.mock.calls[0][1] as string[];
      // Intrinsic args come first
      expect(args.indexOf("--dangerously-skip-permissions")).toBeLessThan(
        args.indexOf("--allowedTools"),
      );
      // Config args before per-invocation args
      expect(args.indexOf("--allowedTools")).toBeLessThan(args.indexOf("--model"));
      // Per-invocation args before prompt
      expect(args.indexOf("--model")).toBeLessThan(args.indexOf("hello"));
    });

    it("merges config.env into runtime env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new ClaudeCliRuntime({
        command: "claude",
        env: { MY_VAR: "value", EXTRA: "extra" },
      });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.MY_VAR).toBe("value");
      expect(opts.env.EXTRA).toBe("extra");
      expect(opts.env.CLAUDECODE).toBe("");
    });

    it("clearEnv strips vars from inherited process env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      // Set a process env var to verify it gets cleared
      const origVal = process.env.TEST_CLEAR_ME;
      process.env.TEST_CLEAR_ME = "should-be-gone";

      try {
        const runtime = new ClaudeCliRuntime({
          command: "claude",
          clearEnv: ["TEST_CLEAR_ME"],
        });
        const iter = runtime.execute(defaultParams());

        queueMicrotask(() => child.emit("close", 0));
        await collectEvents(iter);

        const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
        expect(opts.env.TEST_CLEAR_ME).toBeUndefined();
        // Other env vars should still be present
        expect(opts.env.CLAUDECODE).toBe("");
      } finally {
        if (origVal === undefined) {
          delete process.env.TEST_CLEAR_ME;
        } else {
          process.env.TEST_CLEAR_ME = origVal;
        }
      }
    });

    it("preserves backward compatibility when no config provided", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new ClaudeCliRuntime();
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      expect(spawnMock.mock.calls[0][0]).toBe("claude");

      const args = spawnMock.mock.calls[0][1] as string[];
      expect(args).toEqual([
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        "hello",
      ]);
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

      // No backend config — uses defaults
      // Fresh ratio 0.8 * 300_000 = 240_000, clamped to [180_000, 600_000] = 240_000
      const runtime = new ClaudeCliRuntime();
      const iter = runtime.execute(defaultParams({ timeoutMs: 300_000 }));
      const eventsPromise = collectEvents(iter);

      // Advance past the 240_000ms watchdog
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

    it("uses resume profile when sessionId is set", async () => {
      vi.useFakeTimers();
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      // noOutputTimeoutMs: 5_000 (above CLI_WATCHDOG_MIN_TIMEOUT_MS = 1_000)
      const runtime = new ClaudeCliRuntime({
        command: "claude",
        reliability: {
          watchdog: {
            resume: { noOutputTimeoutMs: 5_000 },
          },
        },
      });
      const iter = runtime.execute(defaultParams({ sessionId: "s-existing", timeoutMs: 300_000 }));
      const eventsPromise = collectEvents(iter);

      await vi.advanceTimersByTimeAsync(5_500);
      child.emit("close", null);

      const events = await eventsPromise;
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toEqual({
        type: "error",
        message: "No output for 5000ms (watchdog)",
        category: "timeout",
      });
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("uses fresh profile when no sessionId", async () => {
      vi.useFakeTimers();
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      // noOutputTimeoutMs: 5_000 (above CLI_WATCHDOG_MIN_TIMEOUT_MS = 1_000)
      const runtime = new ClaudeCliRuntime({
        command: "claude",
        reliability: {
          watchdog: {
            fresh: { noOutputTimeoutMs: 5_000 },
          },
        },
      });
      const iter = runtime.execute(defaultParams({ timeoutMs: 300_000 }));
      const eventsPromise = collectEvents(iter);

      await vi.advanceTimersByTimeAsync(5_500);
      child.emit("close", null);

      const events = await eventsPromise;
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toEqual({
        type: "error",
        message: "No output for 5000ms (watchdog)",
        category: "timeout",
      });
    });

    it("resets watchdog on stdout output", async () => {
      vi.useFakeTimers();
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      // Watchdog at 5_000ms
      const runtime = new ClaudeCliRuntime({
        command: "claude",
        reliability: {
          watchdog: {
            fresh: { noOutputTimeoutMs: 5_000 },
          },
        },
      });
      const iter = runtime.execute(defaultParams({ timeoutMs: 300_000 }));
      const eventsPromise = collectEvents(iter);

      // Emit output at 3s and 6s (each resets the 5s watchdog)
      await vi.advanceTimersByTimeAsync(3_000);
      child.stdout.emit("data", Buffer.from("output\n"));

      await vi.advanceTimersByTimeAsync(3_000);
      child.stdout.emit("data", Buffer.from("output\n"));

      // Close at 8s — watchdog would have fired at 11s (6s + 5s), so no error
      await vi.advanceTimersByTimeAsync(2_000);
      child.emit("close", 0);

      const events = await eventsPromise;
      const errEvent = events.find((e) => e.type === "error");
      expect(errEvent).toBeUndefined();
    });
  });
});
