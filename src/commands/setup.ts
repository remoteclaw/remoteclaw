import fs from "node:fs/promises";
import JSON5 from "json5";
import { ensureAgentWorkspace } from "../agents/workspace.js";
import { type RemoteClawConfig, createConfigIO, writeConfigFile } from "../config/config.js";
import { formatConfigPath } from "../config/logging.js";
import { resolveSessionTranscriptsDir } from "../config/sessions.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";

async function readConfigFileRaw(configPath: string): Promise<{
  exists: boolean;
  parsed: RemoteClawConfig;
}> {
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON5.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { exists: true, parsed: parsed as RemoteClawConfig };
    }
    return { exists: true, parsed: {} };
  } catch {
    return { exists: false, parsed: {} };
  }
}

export async function setupCommand(
  opts?: { workspace?: string },
  runtime: RuntimeEnv = defaultRuntime,
) {
  const desiredWorkspace =
    typeof opts?.workspace === "string" && opts.workspace.trim()
      ? opts.workspace.trim()
      : undefined;

  const io = createConfigIO();
  const configPath = io.configPath;
  const existingRaw = await readConfigFileRaw(configPath);
  const cfg = existingRaw.parsed;

  if (!existingRaw.exists) {
    await writeConfigFile(cfg);
    runtime.log(`Wrote ${formatConfigPath(configPath)}`);
  } else {
    runtime.log(`Config OK: ${formatConfigPath(configPath)}`);
  }

  if (desiredWorkspace) {
    const ws = await ensureAgentWorkspace(desiredWorkspace);
    runtime.log(`Workspace OK: ${shortenHomePath(ws)}`);
  }

  const sessionsDir = resolveSessionTranscriptsDir();
  await fs.mkdir(sessionsDir, { recursive: true });
  runtime.log(`Sessions OK: ${shortenHomePath(sessionsDir)}`);
}
