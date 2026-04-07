import fs from "node:fs/promises";

export async function ensureAgentWorkspace(
  dirOrParams: string | { dir: string; ensureBootstrapFiles?: boolean },
): Promise<{ dir: string }> {
  const dir = typeof dirOrParams === "string" ? dirOrParams : dirOrParams.dir;
  await fs.mkdir(dir, { recursive: true });
  return { dir };
}
