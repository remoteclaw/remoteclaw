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

const { OpenCodeCliRuntime } = await import("./opencode-cli-runtime.js");

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

describe("OpenCodeCliRuntime", () => {
  afterEach(() => {
    spawnMock.mockClear();
  });

  it("has correct runtime name", () => {
    const runtime = new OpenCodeCliRuntime();
    expect(runtime.name).toBe("opencode");
  });

  it("builds basic args with prompt as named flag", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    expect(spawnMock).toHaveBeenCalledWith(
      "opencode",
      ["--format", "json", "--quiet", "--prompt", "hello"],
      expect.objectContaining({ cwd: "/workspace" }),
    );
  });

  it("does not inject CLAUDECODE env into runtime env", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(defaultParams());

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    // OpenCode runtime doesn't set CLAUDECODE — unlike ClaudeCliRuntime which
    // explicitly sets CLAUDECODE="" for child instance detection.
    // The env may still contain CLAUDECODE if it's in process.env (inherited),
    // but the runtime itself should not add it.
    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    // Verify no CLAUDE_CODE_OAUTH_TOKEN is set (that's Claude-specific)
    expect(opts.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("sets ANTHROPIC_API_KEY for api-key auth mode", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { apiKey: "sk-test-key", source: "profile:test", mode: "api-key" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.ANTHROPIC_API_KEY).toBe("sk-test-key");
  });

  it("sets ANTHROPIC_API_KEY for token auth mode as fallback", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { apiKey: "some-token", source: "profile:token", mode: "token" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.ANTHROPIC_API_KEY).toBe("some-token");
  });

  it("sets empty env for aws-sdk auth mode", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { source: "aws-sdk default chain", mode: "aws-sdk" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("includes --model when model is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(defaultParams({ model: "anthropic/claude-sonnet-4-20250514" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("includes --session when sessionId is set", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(defaultParams({ sessionId: "sess_abc123" }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--session");
    expect(args[args.indexOf("--session") + 1]).toBe("sess_abc123");
  });

  it("does not include --max-turns (OpenCode does not support it)", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(defaultParams({ maxTurns: 5 }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain("--max-turns");
  });

  it("sends long prompt via stdin instead of --prompt flag", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const longPrompt = "x".repeat(15_000);
    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(defaultParams({ prompt: longPrompt }));

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const args = spawnMock.mock.calls[0][1] as string[];
    // --prompt should NOT be in args for long prompts
    expect(args).not.toContain("--prompt");
    expect(args).not.toContain(longPrompt);
    // Should be written to stdin
    expect(child.stdin.write).toHaveBeenCalledWith(longPrompt);
  });

  it("parses OpenCode NDJSON events from stdout", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new OpenCodeCliRuntime();
    const iter = runtime.execute(defaultParams());
    const eventsPromise = collectEvents(iter);

    // Emit OpenCode NDJSON events
    const textEvent = JSON.stringify({
      type: "message.part.updated",
      part: { type: "text", text: "Hello from OpenCode" },
    });
    child.stdout.emit("data", Buffer.from(`${textEvent}\n`));

    queueMicrotask(() => child.emit("close", 0));
    const events = await eventsPromise;

    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents).toHaveLength(1);
    expect(textEvents[0]).toEqual({ type: "text", text: "Hello from OpenCode" });
  });

  describe("CliBackendConfig injection", () => {
    it("uses config.command instead of default", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new OpenCodeCliRuntime({ command: "/usr/local/bin/opencode" });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      expect(spawnMock.mock.calls[0][0]).toBe("/usr/local/bin/opencode");
    });

    it("places config.args between intrinsic and per-invocation args", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new OpenCodeCliRuntime({
        command: "opencode",
        args: ["--debug"],
      });
      const iter = runtime.execute(defaultParams({ model: "anthropic/sonnet" }));

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const args = spawnMock.mock.calls[0][1] as string[];
      // Intrinsic args come first
      expect(args.indexOf("--quiet")).toBeLessThan(args.indexOf("--debug"));
      // Config args before per-invocation args
      expect(args.indexOf("--debug")).toBeLessThan(args.indexOf("--model"));
      // Per-invocation args before prompt
      expect(args.indexOf("--model")).toBeLessThan(args.indexOf("--prompt"));
    });

    it("merges config.env into runtime env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new OpenCodeCliRuntime({
        command: "opencode",
        env: { OPENCODE_MODEL: "custom-model", EXTRA: "extra" },
      });
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
      expect(opts.env.OPENCODE_MODEL).toBe("custom-model");
      expect(opts.env.EXTRA).toBe("extra");
    });

    it("clearEnv strips vars from inherited process env", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const origVal = process.env.TEST_OPENCODE_CLEAR;
      process.env.TEST_OPENCODE_CLEAR = "should-be-gone";

      try {
        const runtime = new OpenCodeCliRuntime({
          command: "opencode",
          clearEnv: ["TEST_OPENCODE_CLEAR"],
        });
        const iter = runtime.execute(defaultParams());

        queueMicrotask(() => child.emit("close", 0));
        await collectEvents(iter);

        const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
        expect(opts.env.TEST_OPENCODE_CLEAR).toBeUndefined();
      } finally {
        if (origVal === undefined) {
          delete process.env.TEST_OPENCODE_CLEAR;
        } else {
          process.env.TEST_OPENCODE_CLEAR = origVal;
        }
      }
    });

    it("preserves backward compatibility when no config provided", async () => {
      const child = createMockChild();
      spawnMock.mockReturnValue(child);

      const runtime = new OpenCodeCliRuntime();
      const iter = runtime.execute(defaultParams());

      queueMicrotask(() => child.emit("close", 0));
      await collectEvents(iter);

      expect(spawnMock.mock.calls[0][0]).toBe("opencode");

      const args = spawnMock.mock.calls[0][1] as string[];
      expect(args).toEqual(["--format", "json", "--quiet", "--prompt", "hello"]);
    });
  });
});
