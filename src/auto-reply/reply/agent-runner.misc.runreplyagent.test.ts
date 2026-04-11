import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import { loadSessionStore, saveSessionStore } from "../../config/sessions.js";
import { onAgentEvent } from "../../infra/agent-events.js";
import type {
  AgentDeliveryResult,
  BridgeCallbacks,
  ChannelMessage,
  McpSideEffects,
} from "../../middleware/types.js";
import type { TemplateContext } from "../templating.js";
import type { ReplyPayload } from "../types.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const channelBridgeHandleMock = vi.fn();
const runtimeErrorMock = vi.fn();

type BridgeConstructorOpts = {
  provider: string;
  sessionMap: unknown;
  gatewayUrl: string;
  gatewayToken: string;
  workspaceDir?: string;
  runtimeArgs?: string[];
  runtimeEnv?: Record<string, string>;
};
const bridgeConstructorCalls: BridgeConstructorOpts[] = [];

vi.mock("../../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    constructor(opts: BridgeConstructorOpts) {
      bridgeConstructorCalls.push(opts);
    }
    handle(message: ChannelMessage, callbacks?: BridgeCallbacks, abortSignal?: AbortSignal) {
      return channelBridgeHandleMock(message, callbacks, abortSignal);
    }
  },
}));

vi.mock("../../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/paths.js")>();
  return {
    ...actual,
    resolveGatewayPort: () => 9999,
  };
});

vi.mock("../../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: () => ({ token: "test-token" }),
}));

vi.mock("../../runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../../runtime.js")>("../../runtime.js");
  return {
    ...actual,
    defaultRuntime: {
      ...actual.defaultRuntime,
      log: vi.fn(),
      error: (...args: unknown[]) => runtimeErrorMock(...args),
      exit: vi.fn(),
    },
  };
});

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

import { runReplyAgent } from "./agent-runner.js";

const EMPTY_MCP: McpSideEffects = {
  sentTexts: [],
  sentMediaUrls: [],
  sentTargets: [],
  cronAdds: 0,
};

/** Build an AgentDeliveryResult with sensible defaults. */
function makeDeliveryResult(overrides?: {
  payloads?: ReplyPayload[];
  text?: string;
  sessionId?: string;
  durationMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  model?: string;
  aborted?: boolean;
  errorSubtype?: string;
  stopReason?: string;
  mcp?: Partial<McpSideEffects>;
  error?: string;
}): AgentDeliveryResult {
  const mcp = { ...EMPTY_MCP, ...overrides?.mcp };
  const usage = overrides?.usage;
  const agentMeta: Record<string, unknown> = {};
  if (usage) {
    agentMeta.usage = {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cacheReadTokens,
      cacheWrite: usage.cacheWriteTokens,
    };
  }
  if (overrides?.model) {
    agentMeta.model = overrides.model;
  }
  const hasMeta = Object.keys(agentMeta).length > 0;
  return {
    payloads: overrides?.payloads ?? [{ text: "final" }],
    run: {
      text: overrides?.text ?? "",
      sessionId: overrides?.sessionId,
      durationMs: overrides?.durationMs ?? 0,
      usage: overrides?.usage,
      aborted: overrides?.aborted ?? false,
      errorSubtype: overrides?.errorSubtype,
      stopReason: overrides?.stopReason,
    },
    mcp,
    error: overrides?.error,
    meta: hasMeta ? { agentMeta } : undefined,
    messagingToolSentTargets: mcp.sentTargets.length > 0 ? mcp.sentTargets : undefined,
    messagingToolSentTexts: mcp.sentTexts.length > 0 ? mcp.sentTexts : undefined,
    messagingToolSentMediaUrls: mcp.sentMediaUrls.length > 0 ? mcp.sentMediaUrls : undefined,
    successfulCronAdds:
      mcp.cronAdds > 0 ? Array.from({ length: mcp.cronAdds }, () => ({})) : undefined,
  };
}

beforeEach(() => {
  channelBridgeHandleMock.mockClear();
  runtimeErrorMock.mockClear();
  bridgeConstructorCalls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runReplyAgent onAgentRunStart", () => {
  function createRun(params?: {
    provider?: string;
    model?: string;
    opts?: {
      runId?: string;
      onAgentRunStart?: (runId: string) => void;
    };
  }) {
    const provider = params?.provider ?? "anthropic";
    const model = params?.model ?? "claude";
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "webchat",
      OriginatingTo: "session:1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "webchat",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: { agents: { defaults: { runtime: "claude" } } },
        provider,
        model,

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      opts: params?.opts,
      typing,
      sessionCtx,
      defaultModel: `${provider}/${model}`,
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });
  }

  it("always emits start callback before agent run attempt", async () => {
    channelBridgeHandleMock.mockRejectedValueOnce(
      new Error('No API key found for provider "anthropic".'),
    );
    const onAgentRunStart = vi.fn();

    const result = await createRun({
      opts: { runId: "run-no-start", onAgentRunStart },
    });

    // In RemoteClaw, start is always emitted before the ChannelBridge attempt.
    // Model fallback is gone — CLI agents handle their own auth/model selection.
    expect(onAgentRunStart).toHaveBeenCalledTimes(1);
    expect(onAgentRunStart).toHaveBeenCalledWith("run-no-start");
    expect(result).toMatchObject({
      text: expect.stringContaining('No API key found for provider "anthropic".'),
    });
  });

  it("emits start callback when cli runner starts", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );
    const onAgentRunStart = vi.fn();

    const result = await createRun({
      provider: "claude-cli",
      model: "opus-4.5",
      opts: { runId: "run-started", onAgentRunStart },
    });

    expect(onAgentRunStart).toHaveBeenCalledTimes(1);
    expect(onAgentRunStart).toHaveBeenCalledWith("run-started");
    expect(result).toMatchObject({ text: "ok" });
  });
});

describe("runReplyAgent token update", () => {
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
        config: params.config ?? { agents: { defaults: { runtime: "claude" } } },
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;
    return { typing, sessionCtx, resolvedQueue, followupRun };
  }

  it("persists usage from bridge result", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-compact-tokens-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    const sessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 181_000,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

    // ChannelBridge returns usage via AgentDeliveryResult; lastCallUsage is
    // not available through the bridge path, so the accumulated usage is used.
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "done" }],
        usage: { inputTokens: 10_000, outputTokens: 3_000 },
      }),
    );

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

      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    expect(stored[sessionKey].inputTokens).toBe(10_000);
    expect(stored[sessionKey].outputTokens).toBe(3_000);
  });

  it("persists usage tokens from bridge result", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-usage-last-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    const sessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 50_000,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });

    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "ok" }],
        usage: { inputTokens: 75_000, outputTokens: 5_000 },
      }),
    );

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

      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    expect(stored[sessionKey].inputTokens).toBe(75_000);
    expect(stored[sessionKey].outputTokens).toBe(5_000);
  });
});

describe("runReplyAgent block streaming", () => {
  it("coalesces duplicate text_end block replies", async () => {
    const onBlockReply = vi.fn();
    channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        void callbacks?.onBlockReply?.({ text: "Hello" });
        void callbacks?.onBlockReply?.({ text: "Hello" });
        return makeDeliveryResult({ payloads: [{ text: "Final message" }] });
      },
    );

    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "discord",
      OriginatingTo: "channel:C1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "discord",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: {
          agents: {
            defaults: {
              runtime: "claude",
              blockStreamingCoalesce: {
                minChars: 1,
                maxChars: 200,
                idleMs: 0,
              },
            },
          },
        },
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "text_end",
      },
    } as unknown as FollowupRun;

    const result = await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      opts: { onBlockReply },
      typing,
      sessionCtx,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: true,
      blockReplyChunking: {
        minChars: 1,
        maxChars: 200,
        breakPreference: "paragraph",
      },
      resolvedBlockStreamingBreak: "text_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(onBlockReply).toHaveBeenCalledTimes(1);
    expect(onBlockReply.mock.calls[0][0].text).toBe("Hello");
    expect(result).toBeUndefined();
  });

  it("returns the final payload when onBlockReply times out", async () => {
    vi.useFakeTimers();
    let sawAbort = false;

    const onBlockReply = vi.fn((_payload, context) => {
      return new Promise<void>((resolve) => {
        context?.abortSignal?.addEventListener(
          "abort",
          () => {
            sawAbort = true;
            resolve();
          },
          { once: true },
        );
      });
    });

    channelBridgeHandleMock.mockImplementationOnce(
      async (_message: ChannelMessage, callbacks?: BridgeCallbacks) => {
        void callbacks?.onBlockReply?.({ text: "Chunk" });
        return makeDeliveryResult({ payloads: [{ text: "Final message" }] });
      },
    );

    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "discord",
      OriginatingTo: "channel:C1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "discord",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: {
          agents: {
            defaults: {
              runtime: "claude",
              blockStreamingCoalesce: {
                minChars: 1,
                maxChars: 200,
                idleMs: 0,
              },
            },
          },
        },
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "text_end",
      },
    } as unknown as FollowupRun;

    const resultPromise = runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      opts: { onBlockReply, blockReplyTimeoutMs: 1 },
      typing,
      sessionCtx,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: true,
      blockReplyChunking: {
        minChars: 1,
        maxChars: 200,
        breakPreference: "paragraph",
      },
      resolvedBlockStreamingBreak: "text_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    await vi.advanceTimersByTimeAsync(5);
    const result = await resultPromise;

    expect(sawAbort).toBe(true);
    expect(result).toMatchObject({ text: "Final message" });
  });
});

describe("runReplyAgent claude-cli routing", () => {
  function createRun() {
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "webchat",
      OriginatingTo: "session:1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "webchat",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: { agents: { defaults: { runtime: "claude" } } },
        provider: "claude-cli",
        model: "opus-4.5",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return runReplyAgent({
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
      defaultModel: "claude-cli/opus-4.5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });
  }

  it("uses claude-cli runner for claude-cli provider", async () => {
    const runId = "00000000-0000-0000-0000-000000000001";
    const randomSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue(runId);
    const lifecyclePhases: string[] = [];
    const unsubscribe = onAgentEvent((evt) => {
      if (evt.runId !== runId) {
        return;
      }
      if (evt.stream !== "lifecycle") {
        return;
      }
      const phase = evt.data?.phase;
      if (typeof phase === "string") {
        lifecyclePhases.push(phase);
      }
    });
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    const result = await createRun();
    unsubscribe();
    randomSpy.mockRestore();

    expect(channelBridgeHandleMock).toHaveBeenCalledTimes(1);
    expect(lifecyclePhases).toEqual(["start", "end"]);
    expect(result).toMatchObject({ text: "ok" });
  });
});

describe("runReplyAgent messaging tool suppression", () => {
  function createRun(
    messageProvider = "slack",
    opts: { storePath?: string; sessionKey?: string } = {},
  ) {
    const typing = createMockTypingController();
    const sessionKey = opts.sessionKey ?? "main";
    const sessionCtx = {
      Provider: messageProvider,
      OriginatingTo: "channel:C1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey,
        messageProvider,
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: { agents: { defaults: { runtime: "claude" } } },
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return runReplyAgent({
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
      sessionKey,
      storePath: opts.storePath,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });
  }

  it("drops replies when a messaging tool sent via the same provider + target", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "hello world!" }],
        mcp: {
          sentTexts: ["different message"],
          sentTargets: [{ tool: "slack", provider: "slack", to: "channel:C1" }],
        },
      }),
    );

    const result = await createRun("slack");

    expect(result).toBeUndefined();
  });

  it("delivers replies when tool provider does not match", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "hello world!" }],
        mcp: {
          sentTexts: ["different message"],
          sentTargets: [{ tool: "discord", provider: "discord", to: "channel:C1" }],
        },
      }),
    );

    const result = await createRun("slack");

    expect(result).toMatchObject({ text: "hello world!" });
  });

  it("keeps final reply when text matches a cross-target messaging send", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "hello world!" }],
        mcp: {
          sentTexts: ["hello world!"],
          sentTargets: [{ tool: "discord", provider: "discord", to: "channel:C1" }],
        },
      }),
    );

    const result = await createRun("slack");

    expect(result).toMatchObject({ text: "hello world!" });
  });

  it("delivers replies when account ids do not match", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "hello world!" }],
        mcp: {
          sentTexts: ["different message"],
          sentTargets: [
            {
              tool: "slack",
              provider: "slack",
              to: "channel:C1",
              accountId: "alt",
            },
          ],
        },
      }),
    );

    const result = await createRun("slack");

    expect(result).toMatchObject({ text: "hello world!" });
  });

  it("persists usage fields even when replies are suppressed", async () => {
    const storePath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-session-store-")),
      "sessions.json",
    );
    const sessionKey = "main";
    const entry: SessionEntry = { sessionId: "session", updatedAt: Date.now() };
    await saveSessionStore(storePath, { [sessionKey]: entry });

    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "hello world!" }],
        usage: { inputTokens: 10, outputTokens: 5 },
        model: "claude",
        mcp: {
          sentTexts: ["different message"],
          sentTargets: [{ tool: "slack", provider: "slack", to: "channel:C1" }],
        },
      }),
    );

    const result = await createRun("slack", { storePath, sessionKey });

    expect(result).toBeUndefined();
    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[sessionKey]?.inputTokens).toBe(10);
    expect(store[sessionKey]?.outputTokens).toBe(5);
    expect(store[sessionKey]?.totalTokens).toBeUndefined();
    expect(store[sessionKey]?.totalTokensFresh).toBe(false);
    expect(store[sessionKey]?.model).toBe("claude");
  });

  it("persists usage when bridge provides token data", async () => {
    const storePath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-session-store-")),
      "sessions.json",
    );
    const sessionKey = "main";
    const entry: SessionEntry = { sessionId: "session", updatedAt: Date.now() };
    await saveSessionStore(storePath, { [sessionKey]: entry });

    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "hello world!" }],
        usage: { inputTokens: 10, outputTokens: 5 },
        model: "claude",
        mcp: {
          sentTexts: ["different message"],
          sentTargets: [{ tool: "slack", provider: "slack", to: "channel:C1" }],
        },
      }),
    );

    const result = await createRun("slack", { storePath, sessionKey });

    expect(result).toBeUndefined();
    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[sessionKey]?.inputTokens).toBe(10);
    expect(store[sessionKey]?.outputTokens).toBe(5);
    expect(store[sessionKey]?.model).toBe("claude");
  });

  it("preserves existing token data when bridge omits usage", async () => {
    const storePath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-session-store-")),
      "sessions.json",
    );
    const sessionKey = "main";
    const entry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      inputTokens: 111,
      outputTokens: 22,
    };
    await saveSessionStore(storePath, { [sessionKey]: entry });

    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "hello world!" }],
        mcp: {
          sentTexts: ["different message"],
          sentTargets: [{ tool: "slack", provider: "slack", to: "channel:C1" }],
        },
      }),
    );

    const result = await createRun("slack", { storePath, sessionKey });

    expect(result).toBeUndefined();
    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[sessionKey]?.inputTokens).toBe(111);
    expect(store[sessionKey]?.outputTokens).toBe(22);
  });
});

describe("runReplyAgent ChannelBridge constructor args", () => {
  function createRun(overrides?: {
    runtime?: string;
    runtimeArgs?: string[];
    workspaceDir?: string;
    agentId?: string;
  }) {
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "webchat",
      OriginatingTo: "session:1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const agentId = overrides?.agentId ?? "main";
    const config: Record<string, unknown> = {
      agents: {
        defaults: {
          runtime: overrides?.runtime ?? "claude",
          ...(overrides?.runtimeArgs ? { runtimeArgs: overrides.runtimeArgs } : {}),
        },
      },
    };
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        agentId,
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "webchat",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: overrides?.workspaceDir ?? "/tmp/workspace",
        config,
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return runReplyAgent({
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
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });
  }

  it("passes provider from resolveAgentRuntimeOrThrow", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun({ runtime: "claude" });

    expect(bridgeConstructorCalls).toHaveLength(1);
    expect(bridgeConstructorCalls[0].provider).toBe("claude");
  });

  it("passes workspaceDir from followupRun", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun({ workspaceDir: "/custom/workspace" });

    expect(bridgeConstructorCalls).toHaveLength(1);
    expect(bridgeConstructorCalls[0].workspaceDir).toBe("/custom/workspace");
  });

  it("passes runtimeArgs from resolveAgentRuntimeArgs", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun({ runtimeArgs: ["--verbose", "--max-tokens=1000"] });

    expect(bridgeConstructorCalls).toHaveLength(1);
    expect(bridgeConstructorCalls[0].runtimeArgs).toEqual(["--verbose", "--max-tokens=1000"]);
  });

  it("passes undefined runtimeArgs when config omits them", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun();

    expect(bridgeConstructorCalls).toHaveLength(1);
    expect(bridgeConstructorCalls[0].runtimeArgs).toBeUndefined();
  });

  it("passes runtimeEnv from auth-key-retry callback", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun();

    expect(bridgeConstructorCalls).toHaveLength(1);
    // runtimeEnv is the merged env from withAuthKeyRetry — without auth
    // profiles configured it will be the base runtime env (empty or minimal).
    expect(bridgeConstructorCalls[0].runtimeEnv).toBeDefined();
    expect(typeof bridgeConstructorCalls[0].runtimeEnv).toBe("object");
  });

  it("passes a functional sessionMap", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun();

    expect(bridgeConstructorCalls).toHaveLength(1);
    expect(bridgeConstructorCalls[0].sessionMap).toBeDefined();
    // sessionMap should have get and delete methods
    const sessionMap = bridgeConstructorCalls[0].sessionMap as {
      get: () => unknown;
      delete: () => unknown;
    };
    expect(typeof sessionMap.get).toBe("function");
    expect(typeof sessionMap.delete).toBe("function");
  });

  it("passes gatewayUrl derived from config port", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun();

    expect(bridgeConstructorCalls).toHaveLength(1);
    // resolveGatewayPort is mocked to return 9999
    expect(bridgeConstructorCalls[0].gatewayUrl).toBe("ws://127.0.0.1:9999");
  });

  it("passes gatewayToken from credentials config", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({ payloads: [{ text: "ok" }] }),
    );

    await createRun();

    expect(bridgeConstructorCalls).toHaveLength(1);
    // resolveGatewayCredentialsFromConfig is mocked to return { token: "test-token" }
    expect(bridgeConstructorCalls[0].gatewayToken).toBe("test-token");
  });
});

describe("runReplyAgent reminder commitment guard", () => {
  function createRun() {
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "telegram",
      OriginatingTo: "chat",
      AccountId: "primary",
      MessageSid: "msg",
      Surface: "telegram",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "telegram",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: { agents: { defaults: { runtime: "claude" } } },
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return runReplyAgent({
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
      sessionKey: "main",
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });
  }

  it("appends guard note when reminder commitment is not backed by cron.add", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "I'll remind you tomorrow morning." }],
        mcp: { cronAdds: 0 },
      }),
    );

    const result = await createRun();
    expect(result).toMatchObject({
      text: "I'll remind you tomorrow morning.\n\nNote: I did not schedule a reminder in this turn, so this will not trigger automatically.",
    });
  });

  it("keeps reminder commitment unchanged when cron.add succeeded", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "I'll remind you tomorrow morning." }],
        mcp: { cronAdds: 1 },
      }),
    );

    const result = await createRun();
    expect(result).toMatchObject({
      text: "I'll remind you tomorrow morning.",
    });
  });
});

describe("runReplyAgent response usage footer", () => {
  function createRun(params: { responseUsage: "tokens" | "full"; sessionKey: string }) {
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "whatsapp",
      OriginatingTo: "+15550001111",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;

    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      responseUsage: params.responseUsage,
    };

    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        agentId: "main",
        agentDir: "/tmp/agent",
        sessionId: "session",
        sessionKey: params.sessionKey,
        messageProvider: "whatsapp",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: { agents: { defaults: { runtime: "claude" } } },
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return runReplyAgent({
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
      sessionKey: params.sessionKey,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });
  }

  it("appends session key when responseUsage=full", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "ok" }],
        usage: { inputTokens: 12, outputTokens: 3 },
      }),
    );

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({ responseUsage: "full", sessionKey });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).toContain(`· session \`${sessionKey}\``);
  });

  it("does not append session key when responseUsage=tokens", async () => {
    channelBridgeHandleMock.mockResolvedValueOnce(
      makeDeliveryResult({
        payloads: [{ text: "ok" }],
        usage: { inputTokens: 12, outputTokens: 3 },
      }),
    );

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({ responseUsage: "tokens", sessionKey });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).not.toContain("· session ");
  });
});

describe("runReplyAgent transient HTTP retry", () => {
  it("retries once after transient 521 HTML failure and then succeeds", async () => {
    vi.useFakeTimers();
    channelBridgeHandleMock
      .mockRejectedValueOnce(
        new Error(
          `521 <!DOCTYPE html><html lang="en-US"><head><title>Web server is down</title></head><body>Cloudflare</body></html>`,
        ),
      )
      .mockResolvedValueOnce(makeDeliveryResult({ payloads: [{ text: "Recovered response" }] }));

    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "telegram",
      MessageSid: "msg",
    } as unknown as TemplateContext;
    const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session",
        sessionKey: "main",
        messageProvider: "telegram",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: { agents: { defaults: { runtime: "claude" } } },
        provider: "anthropic",
        model: "claude",

        verboseLevel: "off",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    const runPromise = runReplyAgent({
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
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    await vi.advanceTimersByTimeAsync(2_500);
    const result = await runPromise;

    expect(channelBridgeHandleMock).toHaveBeenCalledTimes(2);
    expect(runtimeErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Transient HTTP provider error before reply"),
    );

    const payload = Array.isArray(result) ? result[0] : result;
    expect(payload?.text).toContain("Recovered response");
  });
});
