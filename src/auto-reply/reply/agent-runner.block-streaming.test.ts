import { describe, expect, it, vi } from "vitest";
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

describe("runReplyAgent block streaming", () => {
  it("returns final message from bridge.handle (block streaming from pi-embedded removed)", async () => {
    mockHandle.mockResolvedValueOnce({
      text: "Final message",
      sessionId: "s",
      durationMs: 5,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      aborted: false,
      error: undefined,
    });

    const onBlockReply = vi.fn();
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
              blockStreamingCoalesce: {
                minChars: 1,
                maxChars: 200,
                idleMs: 0,
              },
            },
          },
        },
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

    expect(mockHandle).toHaveBeenCalledTimes(1);
    // The result will contain the final message text from the bridge
    // Block streaming via pi-embedded events is removed; the bridge returns the complete reply
    const payload = Array.isArray(result) ? result[0] : result;
    expect(payload?.text).toContain("Final message");
  });
});
