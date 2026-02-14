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
  it("uses configured prompts for memory flush runs", async () => {
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

    // Memory flush goes through runEmbeddedPiAgent (old path).
    const calls: Array<EmbeddedRunParams> = [];
    runEmbeddedPiAgentMock.mockImplementation(async (params: EmbeddedRunParams) => {
      calls.push(params);
      if (params.prompt === DEFAULT_MEMORY_FLUSH_PROMPT) {
        return { payloads: [], meta: {} };
      }
      return {
        payloads: [{ text: "ok" }],
        meta: { agentMeta: { usage: { input: 1, output: 1 } } },
      };
    });

    // Main turn goes through ChannelBridge (new path).
    mockHandle.mockResolvedValue(defaultReply({ text: "ok" }));

    const { typing, sessionCtx, resolvedQueue, followupRun } = createBaseRun({
      storePath,
      sessionEntry,
      config: {
        agents: {
          defaults: {
            compaction: {
              memoryFlush: {
                prompt: "Write notes.",
                systemPrompt: "Flush memory now.",
              },
            },
          },
        },
      },
      runOverrides: { extraSystemPrompt: "extra system" },
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

    // Memory flush call (via runEmbeddedPiAgent)
    const flushCall = calls[0];
    expect(flushCall?.prompt).toContain("Write notes.");
    expect(flushCall?.prompt).toContain("NO_REPLY");
    expect(flushCall?.extraSystemPrompt).toContain("extra system");
    expect(flushCall?.extraSystemPrompt).toContain("Flush memory now.");
    expect(flushCall?.extraSystemPrompt).toContain("NO_REPLY");

    // Main turn went through ChannelBridge (not via runEmbeddedPiAgent)
    expect(mockHandle).toHaveBeenCalledTimes(1);
    // Only the flush call should have gone through runEmbeddedPiAgent
    expect(calls.length).toBe(1);
  });
  it("skips memory flush after a prior flush in the same compaction cycle", async () => {
    runEmbeddedPiAgentMock.mockReset();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-flush-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    const sessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 80_000,
      compactionCount: 2,
      memoryFlushCompactionCount: 2,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

    // Main turn goes through ChannelBridge (no flush expected).
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

    // No flush call -- runEmbeddedPiAgent should not have been called
    expect(runEmbeddedPiAgentMock).not.toHaveBeenCalled();
    // Main turn went through ChannelBridge
    expect(mockHandle).toHaveBeenCalledTimes(1);
  });
});
