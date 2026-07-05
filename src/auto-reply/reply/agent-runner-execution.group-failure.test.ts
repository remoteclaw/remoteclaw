import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { TemplateContext } from "../templating.js";
import { SILENT_REPLY_TOKEN } from "../tokens.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import type { FollowupRun } from "./queue.js";
import type { TypingSignaler } from "./typing-mode.js";

// resolveAgentRuntimeOrThrow is overridden per-test to throw a controlled failure
// message. The throw propagates through the inner catch (which re-throws) into
// runAgentTurnWithFallback's outer catch, which classifies the message and builds the
// user-facing fallback text under test.
const resolveAgentRuntimeOrThrowMock = vi.fn();

vi.mock("../../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    handle() {
      return Promise.resolve();
    }
  },
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentRuntimeOrThrow: (...args: unknown[]) => resolveAgentRuntimeOrThrowMock(...args),
  resolveAgentRuntimeArgs: vi.fn().mockReturnValue([]),
  resolveAgentRuntimeEnv: vi.fn().mockReturnValue({}),
}));

vi.mock("../../agents/channel-tools.js", () => ({
  resolveChannelMessageToolHints: vi.fn().mockReturnValue([]),
}));

vi.mock("../../config/paths.js", () => ({
  resolveGatewayPort: vi.fn().mockReturnValue(4567),
}));

vi.mock("../../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: vi.fn().mockReturnValue({ token: "gw-test-token" }),
}));

vi.mock("../../globals.js", () => ({
  logVerbose: vi.fn(),
}));

const { runAgentTurnWithFallback } = await import("./agent-runner-execution.js");

type RunAgentTurnParams = Parameters<typeof runAgentTurnWithFallback>[0];

function makeTypingSignals(): TypingSignaler {
  return {
    signalTextDelta: vi.fn().mockResolvedValue(undefined),
  } as unknown as TypingSignaler;
}

function makeFollowupRun(): FollowupRun {
  return {
    run: {
      agentId: "agent-1",
      config: { agents: { defaults: { runtime: "claude" } } },
    },
  } as unknown as FollowupRun;
}

function createMinimalRunAgentTurnParams(overrides?: {
  sessionCtx?: TemplateContext;
  resolvedVerboseLevel?: "off" | "on" | "full";
}): RunAgentTurnParams {
  return {
    commandBody: "hello",
    followupRun: makeFollowupRun(),
    sessionCtx:
      overrides?.sessionCtx ??
      ({ Provider: "discord", MessageSid: "msg" } as unknown as TemplateContext),
    opts: {} as GetReplyOptions,
    typingSignals: makeTypingSignals(),
    blockReplyPipeline: null,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    applyReplyToMode: (payload: ReplyPayload) => payload,
    shouldEmitToolResult: () => true,
    shouldEmitToolOutput: () => false,
    pendingToolTasks: new Set<Promise<void>>(),
    resetSessionAfterCompactionFailure: async () => false,
    resetSessionAfterRoleOrderingConflict: async () => false,
    isHeartbeat: false,
    sessionKey: "main",
    getActiveSessionEntry: (): SessionEntry | undefined => undefined,
    resolvedVerboseLevel: overrides?.resolvedVerboseLevel ?? "off",
  };
}

// A non-billing, non-overflow, non-role-ordering, non-transient runner failure — the
// generic class whose raw boilerplate must not leak into a group/channel audience.
const RAW_RUNNER_FAILURE = "openai-codex/gpt-5.5 ended with an incomplete terminal response";

describe("runAgentTurnWithFallback — group/channel failure suppression", () => {
  beforeEach(() => {
    resolveAgentRuntimeOrThrowMock.mockReset();
  });

  it.each(["group", "channel"] as const)(
    "suppresses raw runner failure to a silent reply in %s chats",
    async (chatType) => {
      resolveAgentRuntimeOrThrowMock.mockImplementation(() => {
        throw new Error(RAW_RUNNER_FAILURE);
      });

      const result = await runAgentTurnWithFallback(
        createMinimalRunAgentTurnParams({
          sessionCtx: {
            Provider: "discord",
            ChatType: chatType,
            MessageSid: "msg",
          } as unknown as TemplateContext,
        }),
      );

      expect(result.kind).toBe("final");
      if (result.kind === "final") {
        expect(result.payload.text).toBe(SILENT_REPLY_TOKEN);
      }
    },
  );

  it("keeps raw runner failure detail visible in direct chats (unchanged)", async () => {
    resolveAgentRuntimeOrThrowMock.mockImplementation(() => {
      throw new Error(RAW_RUNNER_FAILURE);
    });

    const result = await runAgentTurnWithFallback(
      createMinimalRunAgentTurnParams({
        sessionCtx: {
          Provider: "discord",
          ChatType: "direct",
          MessageSid: "msg",
        } as unknown as TemplateContext,
      }),
    );

    expect(result.kind).toBe("final");
    if (result.kind === "final") {
      expect(result.payload.text).toContain("Agent failed before reply");
      expect(result.payload.text).toContain("incomplete terminal response");
      expect(result.payload.text).not.toBe(SILENT_REPLY_TOKEN);
    }
  });

  it("keeps raw runner failure detail visible when ChatType is absent (direct default)", async () => {
    resolveAgentRuntimeOrThrowMock.mockImplementation(() => {
      throw new Error(RAW_RUNNER_FAILURE);
    });

    const result = await runAgentTurnWithFallback(
      createMinimalRunAgentTurnParams({
        sessionCtx: { Provider: "discord", MessageSid: "msg" } as unknown as TemplateContext,
      }),
    );

    expect(result.kind).toBe("final");
    if (result.kind === "final") {
      expect(result.payload.text).toContain("Agent failed before reply");
      expect(result.payload.text).not.toBe(SILENT_REPLY_TOKEN);
    }
  });

  it("surfaces curated billing guidance even in group chats", async () => {
    resolveAgentRuntimeOrThrowMock.mockImplementation(() => {
      throw new Error("insufficient credits");
    });

    const result = await runAgentTurnWithFallback(
      createMinimalRunAgentTurnParams({
        sessionCtx: {
          Provider: "discord",
          ChatType: "group",
          MessageSid: "msg",
        } as unknown as TemplateContext,
      }),
    );

    expect(result.kind).toBe("final");
    if (result.kind === "final") {
      expect(result.payload.text).toContain("billing error");
      expect(result.payload.text).not.toBe(SILENT_REPLY_TOKEN);
    }
  });
});
