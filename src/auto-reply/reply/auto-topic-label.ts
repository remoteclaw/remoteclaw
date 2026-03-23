/**
 * Auto-rename Telegram DM forum topics on first message using LLM.
 *
 * This module provides LLM-based label generation.
 * Config resolution is in auto-topic-label-config.ts (lightweight, testable).
 * The actual topic rename call is channel-specific and handled by the caller.
 *
 * NOTE: The upstream LLM implementation depends on @mariozechner/pi-ai and the
 * pi-embedded model pipeline, both of which were gutted from the RemoteClaw fork.
 * generateTopicLabel is stubbed to return null until an alternative LLM integration
 * is wired (e.g. via AgentRuntime or MCP tool call).
 */
import type { RemoteClawConfig } from "../../config/config.js";
import { logVerbose } from "../../globals.js";

export { resolveAutoTopicLabelConfig } from "./auto-topic-label-config.js";
export type { AutoTopicLabelConfig } from "../../config/types.telegram.js";

export type AutoTopicLabelParams = {
  /** The user's first message text. */
  userMessage: string;
  /** System prompt for the LLM. */
  prompt: string;
  /** The full config object. */
  cfg: RemoteClawConfig;
  /** Agent ID for model resolution. */
  agentId?: string;
  /** Routed agent directory for model/auth resolution. */
  agentDir?: string;
};

/**
 * Generate a topic label using LLM.
 * Returns the generated label or null on failure.
 *
 * Stubbed: the upstream pi-embedded model pipeline was gutted from this fork.
 */
export async function generateTopicLabel(_params: {
  userMessage: string;
  prompt: string;
  cfg: RemoteClawConfig;
  agentId?: string;
  agentDir?: string;
}): Promise<string | null> {
  logVerbose("auto-topic-label: LLM generation not available (pi-embedded pipeline gutted)");
  return null;
}
