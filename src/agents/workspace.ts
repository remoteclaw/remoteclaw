import fs from "node:fs/promises";

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
