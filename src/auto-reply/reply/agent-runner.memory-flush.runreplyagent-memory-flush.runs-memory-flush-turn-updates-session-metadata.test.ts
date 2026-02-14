import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeCallbacks, ChannelMessage, ChannelReply } from "../../middleware/index.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { DEFAULT_MEMORY_FLUSH_PROMPT } from "./memory-flush.js";
import { createMockTypingController } from "./test-helpers.js";

const runEmbeddedPiAgentMock = vi.fn();

type EmbeddedRunParams = {
  prompt?: string;
  extraSystemPrompt?: string;
  onAgentEvent?: (evt: { stream?: string; data?: { phase?: string; willRetry?: boolean } }) => void;
};

vi.mock("../../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../middleware/index.js")>();
  return { ...actual, ChannelBridge: vi.fn(), ClaudeCliRuntime: vi.fn() };
});

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: async ({
    provider,
    model,
    run,
  }: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => ({
    result: await run(provider, model),
    provider,
    model,
  }),
}));

vi.mock("../../agents/cli-runner.js", () => ({
  runCliAgent: vi.fn(),
}));

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: (params: unknown) => runEmbeddedPiAgentMock(params),
}));

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

import { ChannelBridge } from "../../middleware/index.js";
import { runReplyAgent } from "./agent-runner.js";

const mockHandle = vi.fn<
  [ChannelMessage, BridgeCallbacks, AbortSignal | undefined],
  Promise<ChannelReply>
>();

function defaultReply(overrides?: Partial<ChannelReply>): ChannelReply {
  return {
    text: "ok",
    sessionId: "s",
    durationMs: 5,
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    aborted: false,
    error: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  mockHandle.mockReset();
  vi.mocked(ChannelBridge).mockImplementation(function () {
    return { handle: mockHandle } as never;
  });
  mockHandle.mockResolvedValue(defaultReply());
});

async function seedSessionStore(params: {
  storePath: string;
  sessionKey: string;
  entry: Record<string, unknown>;
}) {
  await fs.mkdir(path.dirname(params.storePath), { recursive: true });
  await fs.writeFile(
    params.storePath,
    JSON.stringify({ [params.sessionKey]: params.entry }, null, 2),
    "utf-8",
  );
}

function createBaseRun(params: {
  storePath: string;
  sessionEntry: Record<string, unknown>;
  config?: Record<string, unknown>;
  runOverrides?: Partial<FollowupRun["run"]>;
}) {
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: "whatsapp",
    OriginatingTo: "+15550001111",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: params.config ?? {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
  const run = {
    ...followupRun.run,
    ...params.runOverrides,
    config: params.config ?? followupRun.run.config,
  };

  return {
    typing,
    sessionCtx,
    resolvedQueue,
    followupRun: { ...followupRun, run },
  };
}

describe("runReplyAgent memory flush", () => {
  it("runs a memory flush turn and updates session metadata", async () => {
    runEmbeddedPiAgentMock.mockReset();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-flush-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    const sessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 80_000,
      compactionCount: 1,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

    // The memory flush call goes through runEmbeddedPiAgent (old path).
    const flushCalls: Array<{ prompt?: string }> = [];
    runEmbeddedPiAgentMock.mockImplementation(async (params: EmbeddedRunParams) => {
      flushCalls.push({ prompt: params.prompt });
      return { payloads: [], meta: {} };
    });

    // The main turn goes through ChannelBridge (new path).
    mockHandle.mockResolvedValue(defaultReply({ text: "ok" }));

    const { typing, sessionCtx, resolvedQueue, followupRun } = createBaseRun({
      storePath,
      sessionEntry,
    });

    await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry,
      sessionStore: { [sessionKey]: sessionEntry },
      sessionKey,
      storePath,
      defaultModel: "anthropic/claude-opus-4-5",
      agentCfgContextTokens: 100_000,
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    // Memory flush was called via runEmbeddedPiAgent
    expect(flushCalls.map((call) => call.prompt)).toEqual([DEFAULT_MEMORY_FLUSH_PROMPT]);
    // Main turn was called via ChannelBridge
    expect(mockHandle).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    expect(stored[sessionKey].memoryFlushAt).toBeTypeOf("number");
    expect(stored[sessionKey].memoryFlushCompactionCount).toBe(1);
  });
  it("skips memory flush when disabled in config", async () => {
    runEmbeddedPiAgentMock.mockReset();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-flush-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    const sessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 80_000,
      compactionCount: 1,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

    // No flush expected -- only the main turn via ChannelBridge.
    mockHandle.mockResolvedValue(defaultReply({ text: "ok" }));

    const { typing, sessionCtx, resolvedQueue, followupRun } = createBaseRun({
      storePath,
      sessionEntry,
      config: {
        agents: {
          defaults: { compaction: { memoryFlush: { enabled: false } } },
        },
      },
    });

    await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry,
      sessionStore: { [sessionKey]: sessionEntry },
      sessionKey,
      storePath,
      defaultModel: "anthropic/claude-opus-4-5",
      agentCfgContextTokens: 100_000,
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    // No flush call -- runEmbeddedPiAgent should not have been called
    expect(runEmbeddedPiAgentMock).not.toHaveBeenCalled();
    // Main turn went through ChannelBridge
    expect(mockHandle).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    expect(stored[sessionKey].memoryFlushAt).toBeUndefined();
  });
});
