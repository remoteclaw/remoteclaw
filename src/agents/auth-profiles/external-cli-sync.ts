import type { AuthProfileStore } from "./types.js";

/**
 * No-op stub — external CLI credential syncing was removed along with OAuth support.
 * External CLI tools (Qwen, MiniMax) used OAuth credentials that are no longer supported.
 */
export function syncExternalCliCredentials(_store: AuthProfileStore): boolean {
  return false;
}
