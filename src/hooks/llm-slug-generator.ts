/**
 * LLM-based slug generator for session memory filenames
 */

import type { OpenClawConfig } from "../config/config.js";

/**
 * Generate a short 1-2 word filename slug from session content using LLM.
 *
 * pi-embedded: runEmbeddedPiAgent removed (dead code after AgentRuntime migration).
 * This function is stubbed and always returns null until re-wired to AgentRuntime.
 */
export async function generateSlugViaLLM(_params: {
  sessionContent: string;
  cfg: OpenClawConfig;
}): Promise<string | null> {
  return null;
}
