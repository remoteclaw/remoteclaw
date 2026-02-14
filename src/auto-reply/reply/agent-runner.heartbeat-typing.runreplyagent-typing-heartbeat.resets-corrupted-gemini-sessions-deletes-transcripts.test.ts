import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import type { BridgeCallbacks, ChannelMessage, ChannelReply } from "../../middleware/index.js";
import type { TemplateContext } from "../templating.js";
import type { GetReplyOptions } from "../types.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

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

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: vi.fn().mockResolvedValue({ payloads: [], meta: {} }),
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
    text: "final",
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

function createMinimalRun(params?: {
  opts?: GetReplyOptions;
  resolvedVerboseLevel?: "off" | "on";
  sessionStore?: Record<string, SessionEntry>;
  sessionEntry?: SessionEntry;
  sessionKey?: string;
  storePath?: string;
  typingMode?: TypingMode;
  blockStreamingEnabled?: boolean;
}) {
  const typing = createMockTypingController();
  const opts = params?.opts;
  const sessionCtx = {
    Provider: "whatsapp",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const sessionKey = params?.sessionKey ?? "main";
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      sessionId: "session",
      sessionKey,
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: params?.resolvedVerboseLevel ?? "off",
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

  return {
    typing,
    opts,
    run: () =>
      runReplyAgent({
        commandBody: "hello",
        followupRun,
        queueKey: "main",
        resolvedQueue,
        shouldSteer: false,
        shouldFollowup: false,
        isActive: false,
        isStreaming: false,
        opts,
        typing,
        sessionEntry: params?.sessionEntry,
        sessionStore: params?.sessionStore,
        sessionKey,
        storePath: params?.storePath,
        sessionCtx,
        defaultModel: "anthropic/claude-opus-4-5",
        resolvedVerboseLevel: params?.resolvedVerboseLevel ?? "off",
        isNewSession: false,
        blockStreamingEnabled: params?.blockStreamingEnabled ?? false,
        resolvedBlockStreamingBreak: "message_end",
        shouldInjectGroupIntro: false,
        typingMode: params?.typingMode ?? "instant",
      }),
  };
}

describe("runReplyAgent typing (heartbeat)", () => {
  it("returns error payload when bridge throws role ordering error", async () => {
    // In the new ChannelBridge code, errors are caught and returned as a final
    // payload. No session reset or transcript deletion occurs.
    mockHandle.mockRejectedValueOnce(
      new Error(
        "function call turn comes immediately after a user turn or after a function response turn",
      ),
    );

    const { run } = createMinimalRun({
      sessionEntry: { sessionId: "session-corrupt", updatedAt: Date.now() },
      sessionStore: { main: { sessionId: "session-corrupt", updatedAt: Date.now() } },
      sessionKey: "main",
    });
    const res = await run();

    const payloads = Array.isArray(res) ? res : res ? [res] : [];
    expect(payloads.some((p) => p.text?.includes("Agent failed before reply"))).toBe(true);
  });
  it("returns error payload on generic bridge errors", async () => {
    mockHandle.mockRejectedValueOnce(new Error("INVALID_ARGUMENT: some other failure"));

    const { run } = createMinimalRun({
      sessionEntry: { sessionId: "session-ok", updatedAt: Date.now() },
      sessionStore: { main: { sessionId: "session-ok", updatedAt: Date.now() } },
      sessionKey: "main",
    });
    const res = await run();

    const payloads = Array.isArray(res) ? res : res ? [res] : [];
    expect(payloads.some((p) => p.text?.includes("Agent failed before reply"))).toBe(true);
  });
  it("returns error payload for role ordering errors thrown as exceptions", async () => {
    mockHandle.mockRejectedValueOnce(new Error("400 Incorrect role information"));

    const { run } = createMinimalRun({});
    const res = await run();

    const payloads = Array.isArray(res) ? res : res ? [res] : [];
    expect(payloads.some((p) => p.text?.includes("Agent failed before reply"))).toBe(true);
  });
  it("returns error payload for 'roles must alternate' errors thrown as exceptions", async () => {
    mockHandle.mockRejectedValueOnce(
      new Error('messages: roles must alternate between "user" and "assistant"'),
    );

    const { run } = createMinimalRun({});
    const res = await run();

    const payloads = Array.isArray(res) ? res : res ? [res] : [];
    expect(payloads.some((p) => p.text?.includes("Agent failed before reply"))).toBe(true);
  });
});
