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

  it("sets CLAUDE_CODE_OAUTH_TOKEN env for oauth auth mode", async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const runtime = new ClaudeCliRuntime();
    const iter = runtime.execute(
      defaultParams({
        auth: { apiKey: "oauth-token", source: "profile:oauth", mode: "oauth" },
      }),
    );

    queueMicrotask(() => child.emit("close", 0));
    await collectEvents(iter);

    const opts = spawnMock.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-token");
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
});
