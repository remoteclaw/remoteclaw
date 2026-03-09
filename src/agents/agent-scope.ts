import path from "node:path";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
} from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";
const log = createSubsystemLogger("agent-scope");

/** Strip null bytes from paths to prevent ENOTDIR errors. */
function stripNullBytes(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\0/g, "");
}

export { resolveAgentIdFromSessionKey };

type AgentEntry = NonNullable<NonNullable<RemoteClawConfig["agents"]>["list"]>[number];

type ResolvedAgentConfig = {
  name?: string;
  workspace?: string;
  agentDir?: string;
  humanDelay?: AgentEntry["humanDelay"];
  heartbeat?: AgentEntry["heartbeat"];
  boot?: AgentEntry["boot"];
  identity?: AgentEntry["identity"];
  groupChat?: AgentEntry["groupChat"];
  subagents?: AgentEntry["subagents"];
  sandbox?: AgentEntry["sandbox"];
  tools?: AgentEntry["tools"];
  auth?: AgentEntry["auth"];
  runtime?: AgentEntry["runtime"];
};

let defaultAgentWarned = false;

export function listAgentEntries(cfg: RemoteClawConfig): AgentEntry[] {
  const list = cfg.agents?.list;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((entry): entry is AgentEntry => Boolean(entry && typeof entry === "object"));
}

export function listAgentIds(cfg: RemoteClawConfig): string[] {
  const agents = listAgentEntries(cfg);
  if (agents.length === 0) {
    return [DEFAULT_AGENT_ID];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of agents) {
    const id = normalizeAgentId(entry?.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : [DEFAULT_AGENT_ID];
}

export function resolveDefaultAgentId(cfg: RemoteClawConfig): string {
  const agents = listAgentEntries(cfg);
  if (agents.length === 0) {
    return DEFAULT_AGENT_ID;
  }
  const defaults = agents.filter((agent) => agent?.default);
  if (defaults.length > 1 && !defaultAgentWarned) {
    defaultAgentWarned = true;
    log.warn("Multiple agents marked default=true; using the first entry as default.");
  }
  const chosen = (defaults[0] ?? agents[0])?.id?.trim();
  return normalizeAgentId(chosen || DEFAULT_AGENT_ID);
}

export function resolveSessionAgentIds(params: {
  sessionKey?: string;
  config?: RemoteClawConfig;
  agentId?: string;
}): {
  defaultAgentId: string;
  sessionAgentId: string;
} {
  const defaultAgentId = resolveDefaultAgentId(params.config ?? {});
  const explicitAgentIdRaw =
    typeof params.agentId === "string" ? params.agentId.trim().toLowerCase() : "";
  const explicitAgentId = explicitAgentIdRaw ? normalizeAgentId(explicitAgentIdRaw) : null;
  const sessionKey = params.sessionKey?.trim();
  const normalizedSessionKey = sessionKey ? sessionKey.toLowerCase() : undefined;
  const parsed = normalizedSessionKey ? parseAgentSessionKey(normalizedSessionKey) : null;
  const sessionAgentId =
    explicitAgentId ?? (parsed?.agentId ? normalizeAgentId(parsed.agentId) : defaultAgentId);
  return { defaultAgentId, sessionAgentId };
}

export function resolveSessionAgentId(params: {
  sessionKey?: string;
  config?: RemoteClawConfig;
}): string {
  return resolveSessionAgentIds(params).sessionAgentId;
}

function resolveAgentEntry(cfg: RemoteClawConfig, agentId: string): AgentEntry | undefined {
  const id = normalizeAgentId(agentId);
  return listAgentEntries(cfg).find((entry) => normalizeAgentId(entry.id) === id);
}

export function resolveAgentConfig(
  cfg: RemoteClawConfig,
  agentId: string,
): ResolvedAgentConfig | undefined {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  if (!entry) {
    return undefined;
  }
  return {
    name: typeof entry.name === "string" ? entry.name : undefined,
    workspace: typeof entry.workspace === "string" ? entry.workspace : undefined,
    agentDir: typeof entry.agentDir === "string" ? entry.agentDir : undefined,
    humanDelay: entry.humanDelay,
    heartbeat: entry.heartbeat,
    boot: entry.boot,
    identity: entry.identity,
    groupChat: entry.groupChat,
    subagents: typeof entry.subagents === "object" && entry.subagents ? entry.subagents : undefined,
    sandbox: entry.sandbox,
    tools: entry.tools,
    auth: entry.auth,
    runtime: entry.runtime,
  };
}

/**
 * Resolve the effective auth setting for an agent.
 *
 * Resolution: agent entry `auth` overrides `agents.defaults.auth`.
 * - Explicit `auth: false` on the entry is an opt-out (not the same as undefined).
 * - `undefined` (missing) on the entry inherits from defaults.
 * - Returns `undefined` when neither the entry nor defaults define auth.
 */
export function resolveAgentAuth(
  cfg: RemoteClawConfig,
  agentId: string,
): false | string | string[] | undefined {
  const entry = resolveAgentEntry(cfg, normalizeAgentId(agentId));
  // Explicit per-agent auth (including `false`) overrides defaults.
  if (entry && entry.auth !== undefined) {
    return entry.auth;
  }
  // Fall back to defaults.auth.
  const defaultsAuth = cfg.agents?.defaults?.auth;
  return defaultsAuth !== undefined ? defaultsAuth : undefined;
}

/**
 * Resolve the effective runtime for an agent.
 *
 * Resolution: agent entry `runtime` overrides `agents.defaults.runtime`.
 * Returns `undefined` when neither the entry nor defaults define runtime.
 */
export function resolveAgentRuntime(
  cfg: RemoteClawConfig,
  agentId: string,
): "claude" | "gemini" | "codex" | "opencode" | undefined {
  const entry = resolveAgentEntry(cfg, normalizeAgentId(agentId));
  if (entry?.runtime) {
    return entry.runtime;
  }
  return cfg.agents?.defaults?.runtime ?? undefined;
}

export function resolveFallbackAgentId(params: {
  agentId?: string | null;
  sessionKey?: string | null;
}): string {
  const explicitAgentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
  if (explicitAgentId) {
    return normalizeAgentId(explicitAgentId);
  }
  return resolveAgentIdFromSessionKey(params.sessionKey);
}

export function resolveAgentWorkspaceDir(cfg: RemoteClawConfig, agentId: string): string {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.workspace?.trim();
  if (configured) {
    return stripNullBytes(resolveUserPath(configured));
  }
  throw new Error(
    `agent '${id}' has no workspace configured — set agents.list[].workspace in remoteclaw.json`,
  );
}

export function resolveAgentWorkspaceDirOrNull(
  cfg: RemoteClawConfig,
  agentId: string,
): string | null {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.workspace?.trim();
  if (configured) {
    return stripNullBytes(resolveUserPath(configured));
  }
  return null;
}

export function resolveAgentDir(cfg: RemoteClawConfig, agentId: string) {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.agentDir?.trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const root = resolveStateDir(process.env);
  return path.join(root, "agents", id, "agent");
}
