import type { RemoteClawConfig } from "../../config/config.js";
import type { AuthProfileIdRepairResult } from "./types.js";

/**
 * No-op stub — OAuth profile ID mismatch repair is no longer needed
 * since OAuth credential types have been removed.
 */
export function repairOAuthProfileIdMismatch(params: {
  cfg: RemoteClawConfig;
  store: unknown;
  provider: string;
  legacyProfileId?: string;
}): AuthProfileIdRepairResult {
  return { config: params.cfg, changes: [], migrated: false };
}
