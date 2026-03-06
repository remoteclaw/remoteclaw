import fs from "node:fs/promises";

export async function ensureAgentWorkspace(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
