import fs from "node:fs/promises";

export const DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md";

export async function ensureAgentWorkspace(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
