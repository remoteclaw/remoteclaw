import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { createTempHomeHarness, makeReplyConfig } from "./reply.test-harness.js";
import type { AgentRunLoopResult } from "./reply/agent-runner-execution.js";

const state = vi.hoisted(() => ({
  runAgentTurnMock: vi.fn(),
}));

vi.mock("./reply/agent-runner-execution.js", () => ({
  runAgentTurnWithFallback: (params: unknown) => state.runAgentTurnMock(params),
}));

const webMocks = vi.hoisted(() => ({
  webAuthExists: vi.fn().mockResolvedValue(true),
  getWebAuthAgeMs: vi.fn().mockReturnValue(120_000),
  readWebSelfId: vi.fn().mockReturnValue({ e164: "+1999" }),
}));

vi.mock("../web/session.js", () => webMocks);

import { getReplyFromConfig } from "./reply.js";

function makeSuccessResult(text: string): AgentRunLoopResult {
  return {
    kind: "success",
    runResult: {
      text,
      sessionId: undefined,
      durationMs: 0,
      usage: undefined,
      aborted: false,
      error: undefined,
    },
    didLogHeartbeatStrip: false,
    autoCompactionCompleted: false,
  };
}

const { withTempHome } = createTempHomeHarness({
  prefix: "remoteclaw-typing-",
  beforeEachCase: () => state.runAgentTurnMock.mockClear(),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getReplyFromConfig typing (heartbeat)", () => {
  beforeEach(() => {
    vi.stubEnv("REMOTECLAW_TEST_FAST", "1");
  });

  it("starts typing for normal runs", async () => {
    await withTempHome(async (home) => {
      state.runAgentTurnMock.mockResolvedValueOnce(makeSuccessResult("ok"));
      const onReplyStart = vi.fn();

      await getReplyFromConfig(
        { Body: "hi", From: "+1000", To: "+2000", Provider: "whatsapp" },
        { onReplyStart, isHeartbeat: false },
        makeReplyConfig(home) as unknown as RemoteClawConfig,
      );

      expect(onReplyStart).toHaveBeenCalled();
    });
  });

  it("does not start typing for heartbeat runs", async () => {
    await withTempHome(async (home) => {
      state.runAgentTurnMock.mockResolvedValueOnce(makeSuccessResult("ok"));
      const onReplyStart = vi.fn();

      await getReplyFromConfig(
        { Body: "hi", From: "+1000", To: "+2000", Provider: "whatsapp" },
        { onReplyStart, isHeartbeat: true },
        makeReplyConfig(home) as unknown as RemoteClawConfig,
      );

      expect(onReplyStart).not.toHaveBeenCalled();
    });
  });
});
