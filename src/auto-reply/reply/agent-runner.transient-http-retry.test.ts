import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const runtimeErrorMock = vi.fn();

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

vi.mock("../../runtime.js", () => ({
  defaultRuntime: {
    log: vi.fn(),
    error: (...args: unknown[]) => runtimeErrorMock(...args),
    exit: vi.fn(),
  },
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

describe("runReplyAgent transient HTTP retry", () => {
  beforeEach(() => {
    mockHandle.mockReset();
    runtimeErrorMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error payload when bridge.handle throws (retry logic removed)", async () => {
    mockHandle.mockRejectedValueOnce(
      new Error(
        `521 <!DOCTYPE html><html lang="en-US"><head><title>Web server is down</title></head><body>Cloudflare</body></html>`,
      ),
    );

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

    const result = await runReplyAgent({
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

    // With the new ChannelBridge path, retry logic is removed.
    // bridge.handle() throwing produces an error payload.
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(runtimeErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Agent runtime failed before reply"),
    );

    const payload = Array.isArray(result) ? result[0] : result;
    expect(payload?.text).toContain("Agent failed before reply");
  });
});
