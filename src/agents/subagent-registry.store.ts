import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { normalizeDeliveryContext } from "../utils/delivery-context.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

type PersistedSubagentRegistry = {
  version: 2;
  runs: Record<string, SubagentRunRecord>;
};

const REGISTRY_VERSION = 2 as const;

function resolveSubagentStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.REMOTECLAW_STATE_DIR?.trim();
  if (explicit) {
    return resolveStateDir(env);
  }
  if (env.VITEST || env.NODE_ENV === "test") {
    return path.join(os.tmpdir(), "remoteclaw-test-state", String(process.pid));
  }
  return resolveStateDir(env);
}

export function resolveSubagentRegistryPath(): string {
  return path.join(resolveSubagentStateDir(process.env), "subagents", "runs.json");
}

export function loadSubagentRegistryFromDisk(): Map<string, SubagentRunRecord> {
  const pathname = resolveSubagentRegistryPath();
  const raw = loadJsonFile(pathname);
  if (!raw || typeof raw !== "object") {
    return new Map();
  }
  const record = raw as Partial<PersistedSubagentRegistry>;
  if (record.version !== 2) {
    return new Map();
  }
  const runsRaw = record.runs;
  if (!runsRaw || typeof runsRaw !== "object") {
    return new Map();
  }
  const out = new Map<string, SubagentRunRecord>();
  for (const [runId, entry] of Object.entries(runsRaw)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    if (!entry.runId || typeof entry.runId !== "string") {
      continue;
    }
    out.set(runId, {
      ...entry,
      requesterOrigin: normalizeDeliveryContext(entry.requesterOrigin),
      cleanupCompletedAt:
        typeof entry.cleanupCompletedAt === "number" ? entry.cleanupCompletedAt : undefined,
      cleanupHandled: typeof entry.cleanupHandled === "boolean" ? entry.cleanupHandled : undefined,
      spawnMode: entry.spawnMode === "session" ? "session" : "run",
    });
  }
  return out;
}

export function saveSubagentRegistryToDisk(runs: Map<string, SubagentRunRecord>) {
  const pathname = resolveSubagentRegistryPath();
  const serialized: Record<string, SubagentRunRecord> = {};
  for (const [runId, entry] of runs.entries()) {
    serialized[runId] = entry;
  }
  const out: PersistedSubagentRegistry = {
    version: REGISTRY_VERSION,
    runs: serialized,
  };
  saveJsonFile(pathname, out);
}
