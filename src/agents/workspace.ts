import fs from "node:fs/promises";

export const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
export const DEFAULT_SOUL_FILENAME = "SOUL.md";
export const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
export const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
export const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";

export async function ensureAgentWorkspace(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
