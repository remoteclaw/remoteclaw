/** Process-local reverse registry from prepared agent directories to agent ids. */
import path from "node:path";
import { normalizeAgentId } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  registerResolvedAgentDir: "live",
  resolveRegisteredAgentIdForDir: "live",
} as const;

// Process-local registry mapping resolved agent directories back to agent ids.
// It lets later runtime paths recover scope from an already-prepared agent dir.
const agentIdByDir = new Map<string, string>();

function normalizeAgentDirKey(agentDir: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(resolveUserPath(agentDir, env));
}

/** Register a resolved agent directory for later reverse lookup. */
export function registerResolvedAgentDir(params: {
  agentId: string;
  agentDir: string;
  env?: NodeJS.ProcessEnv;
}): void {
  agentIdByDir.set(
    normalizeAgentDirKey(params.agentDir, params.env),
    normalizeAgentId(params.agentId),
  );
}

/** Resolve the agent id previously registered for an agent directory. */
export function resolveRegisteredAgentIdForDir(
  agentDir: string,
  env?: NodeJS.ProcessEnv,
): string | undefined {
  return agentIdByDir.get(normalizeAgentDirKey(agentDir, env));
}
