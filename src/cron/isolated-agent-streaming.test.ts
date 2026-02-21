import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDeps } from "../cli/deps.js";
import type { BridgeCallbacks } from "../middleware/index.js";
import { makeCfg, makeJob, withTempCronHome } from "./isolated-agent.test-harness.js";

vi.mock("../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/index.js")>();
  return {
    ...actual,
    ChannelBridge: vi.fn(),
    createCliRuntime: vi.fn(),
  };
});
import { ChannelBridge } from "../middleware/index.js";
import { runCronIsolatedAgentTurn } from "./isolated-agent.js";
const withTempHome = withTempCronHome;

const mockHandle = vi.fn();

function makeDeps(): CliDeps {
  return {
    sendMessageSlack: vi.fn(),
    sendMessageWhatsApp: vi.fn(),
    sendMessageTelegram: vi.fn(),
    sendMessageDiscord: vi.fn(),
    sendMessageSignal: vi.fn(),
    sendMessageIMessage: vi.fn(),
  };
}

function mockBridgeOk() {
  mockHandle.mockResolvedValue({
    text: "ok",
    sessionId: "s",
    durationMs: 5,
    usage: undefined,
    aborted: false,
    error: undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ChannelBridge).mockImplementation(function () {
    return { handle: mockHandle };
  } as never);
  mockBridgeOk();
});

describe("cron isolated agent streaming callbacks", () => {
  it("passes BridgeCallbacks to bridge.handle", async () => {
    await withTempHome(async (home) => {
      const { writeSessionStore } = await import("./isolated-agent.test-harness.js");
      const storePath = await writeSessionStore(home, {
        lastProvider: "webchat",
        lastTo: "",
      });

      const cfg = makeCfg(home, storePath);
      const job = makeJob({ kind: "agentTurn", message: "hi" });

      await runCronIsolatedAgentTurn({
        cfg,
        deps: makeDeps(),
        job,
        message: "hi",
        sessionKey: "cron:job-1",
      });

      expect(mockHandle).toHaveBeenCalledOnce();
      const callArgs = mockHandle.mock.calls[0] as unknown[];
      const callbacks = callArgs[1] as BridgeCallbacks;
      expect(callbacks).toBeDefined();
      expect(callbacks.onToolUse).toBeTypeOf("function");
      expect(callbacks.onError).toBeTypeOf("function");
    });
  });

  it("does not provide onPartialText (no interactive user)", async () => {
    await withTempHome(async (home) => {
      const { writeSessionStore } = await import("./isolated-agent.test-harness.js");
      const storePath = await writeSessionStore(home, {
        lastProvider: "webchat",
        lastTo: "",
      });

      const cfg = makeCfg(home, storePath);
      const job = makeJob({ kind: "agentTurn", message: "hi" });

      await runCronIsolatedAgentTurn({
        cfg,
        deps: makeDeps(),
        job,
        message: "hi",
        sessionKey: "cron:job-1",
      });

      const callbacks = mockHandle.mock.calls[0][1] as BridgeCallbacks;
      expect(callbacks.onPartialText).toBeUndefined();
    });
  });
});
