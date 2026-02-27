import type { McpSideEffectsWriter } from "../mcp-side-effects.js";

// ── MCP Handler Context ────────────────────────────────────────────────

/**
 * Shared context passed to all MCP tool handlers.
 * Populated from environment variables set by ChannelBridge.
 */
export type McpHandlerContext = {
  /** Gateway WebSocket URL (e.g., `ws://127.0.0.1:18789`). */
  gatewayUrl: string;
  /** Gateway auth token. */
  gatewayToken: string;
  /** Current session key. */
  sessionKey: string;
  /** Side effects NDJSON writer. */
  sideEffects: McpSideEffectsWriter;
  /** Originating channel (e.g., `telegram`). */
  channel: string;
  /** Originating account ID. */
  accountId: string;
  /** Originating delivery target. */
  to: string;
  /** Originating thread/topic ID. */
  threadId: string;
  /** Whether the message sender is the bot owner. */
  senderIsOwner: boolean;
  /** Tool profile controlling which tool categories are available. */
  toolProfile: string;
};
