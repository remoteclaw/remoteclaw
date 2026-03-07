import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { withTempHome as withTempHomeHarness } from "../config/home-env.test-harness.js";
import type {
  AgentDeliveryResult,
  BridgeCallbacks,
  ChannelMessage,
  McpSideEffects,
} from "../middleware/types.js";
import { getReplyFromConfig } from "./reply.js";

const EMPTY_MCP: McpSideEffects = {
  sentTexts: [],
  sentMediaUrls: [],
  sentTargets: [],
  cronAdds: 0,
};

/** Shape returned by the bridge mock's runAgent. */
type AgentRunResult = {
  payloads?: Array<{ text?: string; mediaUrls?: string[] }>;
  meta?: {
    durationMs?: number;
    aborted?: boolean;
    agentMeta?: {
      sessionId?: string;
      provider?: string;
      model?: string;
      usage?: { input?: number; output?: number };
    };
  };
};

const bridgeMock = vi.hoisted(() => ({
  runAgent: vi.fn(),
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn().mockResolvedValue([]),
}));

/** Convert AgentRunResult to AgentDeliveryResult for the bridge mock. */
function toDeliveryResult(result: AgentRunResult): AgentDeliveryResult {
  return {
    payloads: result?.payloads ?? [],
    run: {
      text: "",
      sessionId: result?.meta?.agentMeta?.sessionId,
      durationMs: result?.meta?.durationMs ?? 0,
      usage: result?.meta?.agentMeta?.usage
        ? {
            inputTokens: result.meta.agentMeta.usage.input ?? 0,
            outputTokens: result.meta.agentMeta.usage.output ?? 0,
          }
        : undefined,
      aborted: result?.meta?.aborted ?? false,
    },
    mcp: { ...EMPTY_MCP },
  };
}

vi.mock("../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    async handle(message: ChannelMessage, callbacks?: BridgeCallbacks) {
      const params = {
        prompt: message.text,
        onBlockReply: callbacks?.onBlockReply,
        onPartialReply: callbacks?.onPartialReply,
        onToolResult: callbacks?.onToolResult,
      } as Record<string, unknown>;
      const result = await bridgeMock.runAgent(params);
      return toDeliveryResult(result);
    }
  },
}));

vi.mock("../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/paths.js")>();
  return {
    ...actual,
    resolveGatewayPort: () => 9999,
  };
});

vi.mock("../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: () => ({ token: "test-token" }),
}));

type GetReplyOptions = NonNullable<Parameters<typeof getReplyFromConfig>[1]>;

function createAgentReply(text: string) {
  return {
    payloads: [{ text }],
    meta: {
      durationMs: 5,
      agentMeta: { sessionId: "s", provider: "p", model: "m" },
    },
  };
}

function createTelegramMessage(messageSid: string) {
  return {
    Body: "ping",
    From: "+1004",
    To: "+2000",
    MessageSid: messageSid,
    Provider: "telegram",
  } as const;
}

function createReplyConfig(home: string, streamMode?: "block"): RemoteClawConfig {
  return {
    agents: {
      defaults: {
        runtime: "claude",
        model: { primary: "anthropic/claude-opus-4-5" },
      },
      list: [{ id: "main", workspace: path.join(home, "remoteclaw") }],
    },
    channels: { telegram: { allowFrom: ["*"], streamMode } },
    session: { store: path.join(home, "sessions.json") },
  };
}

async function runTelegramReply(params: {
  home: string;
  messageSid: string;
  onBlockReply?: GetReplyOptions["onBlockReply"];
  onReplyStart?: GetReplyOptions["onReplyStart"];
  disableBlockStreaming?: boolean;
  streamMode?: "block";
}) {
  return getReplyFromConfig(
    createTelegramMessage(params.messageSid),
    {
      onReplyStart: params.onReplyStart,
      onBlockReply: params.onBlockReply,
      disableBlockStreaming: params.disableBlockStreaming,
    },
    createReplyConfig(params.home, params.streamMode),
  );
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeHarness("remoteclaw-stream-", async (home) => {
    await fs.mkdir(path.join(home, ".remoteclaw", "agents", "main", "sessions"), {
      recursive: true,
    });
    return fn(home);
  });
}

describe("block streaming", () => {
  beforeEach(() => {
    vi.stubEnv("REMOTECLAW_TEST_FAST", "1");
    bridgeMock.runAgent.mockClear();
  });

  it("handles ordering, timeout fallback, and telegram streamMode block", async () => {
    await withTempHome(async (home) => {
      let releaseTyping: (() => void) | undefined;
      const typingGate = new Promise<void>((resolve) => {
        releaseTyping = resolve;
      });
      let resolveOnReplyStart: (() => void) | undefined;
      const onReplyStartCalled = new Promise<void>((resolve) => {
        resolveOnReplyStart = resolve;
      });
      const onReplyStart = vi.fn(() => {
        resolveOnReplyStart?.();
        return typingGate;
      });
      const seen: string[] = [];
      const onBlockReply = vi.fn(async (payload) => {
        seen.push(payload.text ?? "");
      });

      const impl = async (params: {
        onBlockReply?: (payload: { text?: string; mediaUrls?: string[] }) => void | Promise<void>;
      }) => {
        void params.onBlockReply?.({ text: "first" });
        void params.onBlockReply?.({ text: "second" });
        return {
          payloads: [{ text: "first" }, { text: "second" }],
          meta: createAgentReply("first").meta,
        };
      };
      bridgeMock.runAgent.mockImplementation(impl);

      const replyPromise = runTelegramReply({
        home,
        messageSid: "msg-123",
        onReplyStart,
        onBlockReply,
        disableBlockStreaming: false,
      });

      await onReplyStartCalled;
      releaseTyping?.();

      const res = await replyPromise;
      expect(res).toBeUndefined();
      expect(seen).toEqual(["first\n\nsecond"]);

      const onBlockReplyStreamMode = vi.fn().mockResolvedValue(undefined);
      bridgeMock.runAgent.mockImplementation(async () => createAgentReply("final"));

      const resStreamMode = await runTelegramReply({
        home,
        messageSid: "msg-127",
        onBlockReply: onBlockReplyStreamMode,
        streamMode: "block",
      });

      const streamPayload = Array.isArray(resStreamMode) ? resStreamMode[0] : resStreamMode;
      expect(streamPayload?.text).toBe("final");
      expect(onBlockReplyStreamMode).not.toHaveBeenCalled();
    });
  });

  it("trims leading whitespace in block-streamed replies", async () => {
    await withTempHome(async (home) => {
      const seen: string[] = [];
      const onBlockReply = vi.fn(async (payload) => {
        seen.push(payload.text ?? "");
      });

      bridgeMock.runAgent.mockImplementation(
        async (params: {
          onBlockReply?: (payload: { text?: string; mediaUrls?: string[] }) => void | Promise<void>;
        }) => {
          void params.onBlockReply?.({ text: "\n\n  Hello from stream" });
          return createAgentReply("\n\n  Hello from stream");
        },
      );

      const res = await runTelegramReply({
        home,
        messageSid: "msg-128",
        onBlockReply,
        disableBlockStreaming: false,
      });

      expect(res).toBeUndefined();
      expect(onBlockReply).toHaveBeenCalledTimes(1);
      expect(seen).toEqual(["Hello from stream"]);
    });
  });

  it("still parses media directives for direct block payloads", async () => {
    await withTempHome(async (home) => {
      const onBlockReply = vi.fn();

      bridgeMock.runAgent.mockImplementation(
        async (params: {
          onBlockReply?: (payload: { text?: string; mediaUrls?: string[] }) => void | Promise<void>;
        }) => {
          void params.onBlockReply?.({ text: "Result\nMEDIA: ./image.png" });
          return createAgentReply("Result\nMEDIA: ./image.png");
        },
      );

      const res = await runTelegramReply({
        home,
        messageSid: "msg-129",
        onBlockReply,
        disableBlockStreaming: false,
      });

      expect(res).toBeUndefined();
      expect(onBlockReply).toHaveBeenCalledTimes(1);
      expect(onBlockReply.mock.calls[0][0]).toMatchObject({
        text: "Result",
        mediaUrls: ["./image.png"],
      });
    });
  });
});
