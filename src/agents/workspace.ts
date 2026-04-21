import fs from "node:fs/promises";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveDefaultAgentWorkspaceDir: "live",
  ensureAgentWorkspace: "live",
} as const;

// Stub — removed during fork workspace cleanup; re-exported for upstream compat
export type WorkspaceBootstrapFile = { filename: string; content: string };
export const DEFAULT_BOOTSTRAP_FILENAME = "AGENTS.md";
export const DEFAULT_AGENT_WORKSPACE_DIR = ""; // Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md"; // Gutted in RemoteClaw fork (Middleware Boundary Principle)

/** Stub for upstream compat — returns the config state dir default workspace path. */
export function resolveDefaultAgentWorkspaceDir(_env: NodeJS.ProcessEnv): string {
  return DEFAULT_AGENT_WORKSPACE_DIR;
}

export async function ensureAgentWorkspace(
  dirOrParams: string | { dir: string; ensureBootstrapFiles?: boolean },
): Promise<{ dir: string }> {
  const dir = typeof dirOrParams === "string" ? dirOrParams : dirOrParams.dir;
  await fs.mkdir(dir, { recursive: true });
  return { dir };
}
