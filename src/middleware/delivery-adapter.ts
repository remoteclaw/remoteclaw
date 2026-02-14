import type { EmbeddedPiRunResult } from "../agents/pi-embedded-runner/types.js";
import type { ChannelReply } from "./types.js";

/**
 * Maps a middleware `ChannelReply` to the legacy `EmbeddedPiRunResult` shape
 * expected by the delivery layer. This is a temporary bridge — once the
 * pi-embedded types are removed, the delivery layer can consume
 * `ChannelReply` directly.
 */
export function toDeliveryResult(
  reply: ChannelReply,
  provider: string,
  model: string,
): EmbeddedPiRunResult {
  return {
    payloads: reply.text ? [{ text: reply.text }] : undefined,
    meta: {
      durationMs: reply.durationMs,
      agentMeta: {
        sessionId: reply.sessionId ?? "",
        provider,
        model,
        usage: reply.usage
          ? {
              input: reply.usage.inputTokens,
              output: reply.usage.outputTokens,
              cacheRead: reply.usage.cacheReadTokens,
              cacheWrite: reply.usage.cacheWriteTokens,
            }
          : undefined,
      },
      aborted: reply.aborted || undefined,
      error: reply.error ? { kind: "context_overflow" as const, message: reply.error } : undefined,
    },
  };
}
