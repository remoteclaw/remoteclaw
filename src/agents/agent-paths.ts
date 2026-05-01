import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveRemoteClawAgentDir: "live",
} as const;

// Legacy literal used only as the "no specific agent" fallback for the
// auth-store path resolver. This is NOT imported from routing/session-key —
// it's an explicit local default preserved for backwards-compatible auth
// profile lookup across agent directories.
const LEGACY_DEFAULT_AGENT_DIR_NAME = "main";

export function resolveRemoteClawAgentDir(agentId?: string): string {
  const override = process.env.REMOTECLAW_AGENT_DIR?.trim() || process.env.PI_CODING_AGENT_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  const id = agentId ? normalizeAgentId(agentId) : LEGACY_DEFAULT_AGENT_DIR_NAME;
  const agentDir = path.join(resolveStateDir(), "agents", id, "agent");
  return resolveUserPath(agentDir);
}
