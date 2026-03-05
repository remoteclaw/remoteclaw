import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { resolveUserPath } from "../utils.js";

export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const home = resolveRequiredHomeDir(env, homedir);
  const profile = env.REMOTECLAW_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(home, ".remoteclaw", `workspace-${profile}`);
  }
  return path.join(home, ".remoteclaw", "workspace");
}

export const DEFAULT_AGENT_WORKSPACE_DIR = resolveDefaultAgentWorkspaceDir();
export const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
export const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
let gitAvailabilityPromise: Promise<boolean> | null = null;

async function hasGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.stat(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function isGitAvailable(): Promise<boolean> {
  if (gitAvailabilityPromise) {
    return gitAvailabilityPromise;
  }

  gitAvailabilityPromise = (async () => {
    try {
      const result = await runCommandWithTimeout(["git", "--version"], { timeoutMs: 2_000 });
      return result.code === 0;
    } catch {
      return false;
    }
  })();

  return gitAvailabilityPromise;
}

async function ensureGitRepo(dir: string) {
  if (await hasGitRepo(dir)) {
    return;
  }
  if (!(await isGitAvailable())) {
    return;
  }
  try {
    await runCommandWithTimeout(["git", "init"], { cwd: dir, timeoutMs: 10_000 });
  } catch {
    // Ignore git init failures; workspace creation should still succeed.
  }
}

export async function ensureAgentWorkspace(params?: {
  dir?: string;
  ensureBootstrapFiles?: boolean;
}): Promise<{
  dir: string;
}> {
  const rawDir = params?.dir?.trim() ? params.dir.trim() : DEFAULT_AGENT_WORKSPACE_DIR;
  const dir = resolveUserPath(rawDir);
  await fs.mkdir(dir, { recursive: true });

  if (params?.ensureBootstrapFiles) {
    await ensureGitRepo(dir);
  }

  return { dir };
}
