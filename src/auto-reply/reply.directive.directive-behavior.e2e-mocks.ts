import { vi } from "vitest";
import type { AgentDeliveryResult, BridgeCallbacks, ChannelMessage } from "../middleware/types.js";

// Hoisted mock for runEmbeddedPiAgent — the ChannelBridge mock delegates to this
// so that test assertions on vi.mocked(runEmbeddedPiAgent) continue to work.
const hoisted = vi.hoisted(() => ({
  runEmbeddedPiAgent: vi.fn(),
}));

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: hoisted.runEmbeddedPiAgent,
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

/**
 * ChannelBridge mock that delegates to runEmbeddedPiAgent, bridging the
 * ChannelBridge interface to the embedded agent interface so that existing
 * test assertions about runEmbeddedPiAgent calls continue to work.
 */
vi.mock("../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    #provider: string;
    constructor(opts: { provider: string }) {
      this.#provider = opts.provider;
    }
    async handle(
      message: ChannelMessage,
      callbacks?: BridgeCallbacks,
    ): Promise<AgentDeliveryResult> {
      // Build embedded-agent-style params from the bridge interface
      const embeddedParams = {
        prompt: message.text,
        provider: this.#provider,
        onBlockReply: callbacks?.onBlockReply,
        onPartialReply: callbacks?.onPartialReply,
        onToolResult: callbacks?.onToolResult,
      };
      const result = await hoisted.runEmbeddedPiAgent(embeddedParams);
      // Convert EmbeddedPiRunResult → AgentDeliveryResult
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
        mcp: {
          sentTexts: result?.messagingToolSentTexts ?? [],
          sentMediaUrls: result?.messagingToolSentMediaUrls ?? [],
          sentTargets: result?.messagingToolSentTargets ?? [],
          cronAdds: result?.successfulCronAdds ?? 0,
        },
      };
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
