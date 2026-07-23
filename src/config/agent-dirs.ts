// Resolves agent-specific config and workspace directories.
import os from "node:os";
import path from "node:path";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import { resolveUserPath } from "../utils.js";
import { resolveStateDir } from "./paths.js";
import type { RemoteClawConfig } from "./types.js";

type DuplicateAgentDir = {
  agentDir: string;
  agentIds: string[];
};

/** Error thrown when multiple configured agents resolve to the same state directory. */
export class DuplicateAgentDirError extends Error {
  readonly duplicates: DuplicateAgentDir[];

  constructor(duplicates: DuplicateAgentDir[]) {
    super(formatDuplicateAgentDirError(duplicates));
    this.name = "DuplicateAgentDirError";
    this.duplicates = duplicates;
  }
}

function canonicalizeAgentDir(agentDir: string): string {
  const resolved = path.resolve(agentDir);
  if (process.platform === "darwin" || process.platform === "win32") {
    // Agent dirs collide case-insensitively on the common macOS/Windows filesystems.
    return normalizeLowercaseStringOrEmpty(resolved);
  }
  return resolved;
}

function collectReferencedAgentIds(cfg: RemoteClawConfig): string[] {
  const ids = new Set<string>();

  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents?.list : [];
  for (const entry of agents) {
    if (entry?.id) {
      ids.add(normalizeAgentId(entry.id));
    }
  }

  const bindings = cfg.bindings;
  if (Array.isArray(bindings)) {
    for (const binding of bindings) {
      const id = binding?.agentId;
      if (typeof id === "string" && id.trim()) {
        ids.add(normalizeAgentId(id));
      }
    }
  }

  return [...ids];
}

function resolveEffectiveAgentDir(
  cfg: RemoteClawConfig,
  agentId: string,
  deps?: { env?: NodeJS.ProcessEnv; homedir?: () => string },
): string {
  const id = normalizeAgentId(agentId);
  const configured = Array.isArray(cfg.agents?.list)
    ? cfg.agents?.list.find((agent) => normalizeAgentId(agent.id) === id)?.agentDir
    : undefined;
  const trimmed = configured?.trim();
  if (trimmed) {
    return resolveUserPath(trimmed);
  }
  const env = deps?.env ?? process.env;
  const root = resolveStateDir(
    env,
    deps?.homedir ?? (() => resolveRequiredHomeDir(env, os.homedir)),
  );
  return path.join(root, "agents", id, "agent");
}

/** Finds agent ids whose effective agentDir would share auth/session state. */
export function findDuplicateAgentDirs(
  cfg: RemoteClawConfig,
  deps?: { env?: NodeJS.ProcessEnv; homedir?: () => string },
): DuplicateAgentDir[] {
  const byDir = new Map<string, { agentDir: string; agentIds: string[] }>();

  for (const agentId of collectReferencedAgentIds(cfg)) {
    const agentDir = resolveEffectiveAgentDir(cfg, agentId, deps);
    const key = canonicalizeAgentDir(agentDir);
    const entry = byDir.get(key);
    if (entry) {
      entry.agentIds.push(agentId);
    } else {
      byDir.set(key, { agentDir, agentIds: [agentId] });
    }
  }

  return [...byDir.values()].filter((v) => v.agentIds.length > 1);
}

/** Formats duplicate agentDir conflicts with the remediation operators should take. */
export function formatDuplicateAgentDirError(dups: DuplicateAgentDir[]): string {
  const lines: string[] = [
    "Duplicate agentDir detected (multi-agent config).",
    "Each agent must have a unique agentDir; sharing it causes session state collisions.",
    "",
    "Conflicts:",
    ...dups.map((d) => `- ${d.agentDir}: ${d.agentIds.map((id) => `"${id}"`).join(", ")}`),
    "",
    "Fix: remove the shared agents.list[].agentDir override (or give each agent its own directory).",
  ];
  return lines.join("\n");
}
