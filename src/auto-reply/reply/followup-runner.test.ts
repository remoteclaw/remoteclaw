import { describe, expect, it, vi } from "vitest";
import { createFollowupRunner } from "./followup-runner.js";
import type { FollowupRun } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const baseQueuedRun = (messageProvider = "whatsapp"): FollowupRun =>
  ({
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    originatingTo: "channel:C1",
    run: {
      sessionId: "session",
      sessionKey: "main",
      messageProvider,
      agentAccountId: "primary",
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
  }) as FollowupRun;

// pi-embedded: payload delivery, dedupe, compaction, and usage persistence tests removed
// (dead code after AgentRuntime migration — runner returns early without processing payloads)

describe("createFollowupRunner", () => {
  it("returns early without crashing and marks run complete", async () => {
    const onBlockReply = vi.fn(async () => {});
    const typing = createMockTypingController();

    const runner = createFollowupRunner({
      opts: { onBlockReply },
      typing,
      typingMode: "instant",
      defaultModel: "anthropic/claude-opus-4-5",
    });

    await runner(baseQueuedRun());

    // pi-embedded: runner no longer processes payloads, so onBlockReply is not called
    expect(onBlockReply).not.toHaveBeenCalled();
    expect(typing.markRunComplete).toHaveBeenCalled();
  });
});
