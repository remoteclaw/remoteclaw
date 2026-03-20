import type { RemoteClawConfig } from "../../config/types.js";
import type { ReplyPayload } from "../types.js";

/**
 * Creates a normalizer for media paths in reply payloads.
 *
 * In this fork the sandbox subsystem has been removed, so the normalizer is a
 * simple pass-through — it returns the payload unchanged.  The function
 * signature is kept intact so that callers (e.g. agent-runner.ts) continue to
 * compile without modification.
 */
export function createReplyMediaPathNormalizer(_params: {
  cfg: RemoteClawConfig;
  sessionKey?: string;
  workspaceDir: string;
}): (payload: ReplyPayload) => Promise<ReplyPayload> {
  return async (payload) => payload;
}
