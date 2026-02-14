import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

vi.mock("../../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../middleware/index.js")>();
  return {
    ...actual,
    ChannelBridge: vi.fn(),
    ClaudeCliRuntime: vi.fn(),
  };
});

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
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

const mockHandle = vi.fn();

vi.mocked(ChannelBridge).mockImplementation(function () {
  return { handle: mockHandle } as never;
});

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
      config: {},
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

describe("runReplyAgent response usage footer", () => {
  beforeEach(() => {
    mockHandle.mockReset();
  });

  it("appends session key when responseUsage=full", async () => {
    mockHandle.mockResolvedValueOnce({
      text: "ok",
      sessionId: "s",
      durationMs: 5,
      usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
      aborted: false,
      error: undefined,
    });

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({ responseUsage: "full", sessionKey });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).toContain(`· session ${sessionKey}`);
  });

  it("does not append session key when responseUsage=tokens", async () => {
    mockHandle.mockResolvedValueOnce({
      text: "ok",
      sessionId: "s",
      durationMs: 5,
      usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
      aborted: false,
      error: undefined,
    });

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({ responseUsage: "tokens", sessionKey });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).not.toContain("· session ");
  });
});
