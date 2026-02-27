/**
 * LLM-based slug generator for session memory filenames.
 *
 * Stub: the embedded Pi execution engine was removed (#74).
 * Slug generation required `runEmbeddedPiAgent` which is no longer available.
 */

import type { OpenClawConfig } from "../config/config.js";

/**
 * Generate a short 1-2 word filename slug from session content using LLM.
 *
 * Always returns `null` after engine removal (#74).
 */
export async function generateSlugViaLLM(_params: {
  sessionContent: string;
  cfg: OpenClawConfig;
}): Promise<string | null> {
  // Embedded engine removed (#74); LLM slug generation unavailable.
  return null;
}
