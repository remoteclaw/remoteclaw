import fs from "node:fs";
import path from "node:path";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveAgentModelFallbackValues } from "../config/model-input.js";
import { resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  normalizeAgentId,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
} from "../routing/session-key.js";
import {
  lowercasePreservingWhitespace,
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
  readStringValue,
  resolvePrimaryStringValue,
} from "../shared/string-coerce.js";
import { resolveUserPath } from "../utils.js";
import { normalizeSkillFilter } from "./skills/filter.js";
import { resolveDefaultAgentWorkspaceDir } from "./workspace.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  listAgentEntries: "live",
  listAgentIds: "live",
  resolveDefaultAgentId: "live",
  resolveSessionAgentIds: "live",
  resolveSessionAgentId: "live",
  resolveAgentConfig: "live",
  resolveAgentSkillsFilter: "live",
  resolveAgentExplicitModelPrimary: "live",
  resolveAgentEffectiveModelPrimary: "live",
  resolveAgentModelPrimary: "live",
  resolveAgentModelFallbacksOverride: "live",
  resolveFallbackAgentId: "live",
  resolveRunModelFallbacksOverride: "live",
  hasConfiguredModelFallbacks: "live",
  resolveEffectiveModelFallbacks: "live",
  resolveAgentWorkspaceDir: "live",
  resolveAgentIdsByWorkspacePath: "live",
  resolveAgentIdByWorkspacePath: "live",
  resolveAgentDir: "live",
  resolveSessionKeyAgentId: "live",
  resolveSoleAgentId: "live",
  resolveFirstAgentWorkspace: "live",
  resolveAgentWorkspaceDirOrNull: "live",
  resolveAgentRuntime: "live",
  resolveAgentRuntimeArgs: "live",
  resolveAgentRuntimeEnv: "live",
  resolveAgentRuntimeOrThrow: "live",
  resolveAgentAuth: "live",
} as const;

/** Default agent ID used when no explicit agent is configured. */
const DEFAULT_AGENT_ID = "default";
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
  model?: AgentEntry["model"];
  skills?: AgentEntry["skills"];
  humanDelay?: AgentEntry["humanDelay"];
  heartbeat?: AgentEntry["heartbeat"];
  identity?: AgentEntry["identity"];
  groupChat?: AgentEntry["groupChat"];
  subagents?: AgentEntry["subagents"];
  sandbox?: AgentEntry["sandbox"];
  tools?: AgentEntry["tools"];
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
    return [];
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
  return ids;
}

/**
 * Resolve the default agent ID from config.
 * Returns the first agent with `default: true`, or the first agent in the list.
 */
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
  const explicitAgentIdRaw = normalizeLowercaseStringOrEmpty(params.agentId);
  const explicitAgentId = explicitAgentIdRaw ? normalizeAgentId(explicitAgentIdRaw) : null;
  const sessionKey = params.sessionKey?.trim();
  const normalizedSessionKey = sessionKey ? normalizeLowercaseStringOrEmpty(sessionKey) : undefined;
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
    name: readStringValue(entry.name),
    workspace: readStringValue(entry.workspace),
    agentDir: readStringValue(entry.agentDir),
    model:
      typeof entry.model === "string" || (entry.model && typeof entry.model === "object")
        ? entry.model
        : undefined,
    skills: Array.isArray(entry.skills) ? entry.skills : undefined,
    humanDelay: entry.humanDelay,
    heartbeat: entry.heartbeat,
    identity: entry.identity,
    groupChat: entry.groupChat,
    subagents: typeof entry.subagents === "object" && entry.subagents ? entry.subagents : undefined,
    sandbox: entry.sandbox,
    tools: entry.tools,
  };
}

export function resolveAgentSkillsFilter(
  cfg: RemoteClawConfig,
  agentId: string,
): string[] | undefined {
  return normalizeSkillFilter(resolveAgentConfig(cfg, agentId)?.skills);
}

export function resolveAgentExplicitModelPrimary(
  cfg: RemoteClawConfig,
  agentId: string,
): string | undefined {
  const raw = resolveAgentConfig(cfg, agentId)?.model;
  return resolvePrimaryStringValue(raw);
}

export function resolveAgentEffectiveModelPrimary(
  cfg: RemoteClawConfig,
  agentId: string,
): string | undefined {
  return (
    resolveAgentExplicitModelPrimary(cfg, agentId) ??
    resolvePrimaryStringValue(cfg.agents?.defaults?.model)
  );
}

// Backward-compatible alias. Prefer explicit/effective helpers at new call sites.
export function resolveAgentModelPrimary(
  cfg: RemoteClawConfig,
  agentId: string,
): string | undefined {
  return resolveAgentExplicitModelPrimary(cfg, agentId);
}

export function resolveAgentModelFallbacksOverride(
  cfg: RemoteClawConfig,
  agentId: string,
): string[] | undefined {
  const raw = resolveAgentConfig(cfg, agentId)?.model;
  if (!raw || typeof raw === "string") {
    return undefined;
  }
  // Important: treat an explicitly provided empty array as an override to disable global fallbacks.
  if (!Object.hasOwn(raw, "fallbacks")) {
    return undefined;
  }
  return Array.isArray(raw.fallbacks) ? raw.fallbacks : undefined;
}

export function resolveFallbackAgentId(params: {
  agentId?: string | null;
  sessionKey?: string | null;
}): string {
  const explicitAgentId = normalizeOptionalString(params.agentId) ?? "";
  if (explicitAgentId) {
    return normalizeAgentId(explicitAgentId);
  }
  return resolveAgentIdFromSessionKey(params.sessionKey);
}

export function resolveRunModelFallbacksOverride(params: {
  cfg: RemoteClawConfig | undefined;
  agentId?: string | null;
  sessionKey?: string | null;
}): string[] | undefined {
  if (!params.cfg) {
    return undefined;
  }
  return resolveAgentModelFallbacksOverride(
    params.cfg,
    resolveFallbackAgentId({ agentId: params.agentId, sessionKey: params.sessionKey }),
  );
}

export function hasConfiguredModelFallbacks(params: {
  cfg: RemoteClawConfig | undefined;
  agentId?: string | null;
  sessionKey?: string | null;
}): boolean {
  const fallbacksOverride = resolveRunModelFallbacksOverride(params);
  const defaultFallbacks = resolveAgentModelFallbackValues(params.cfg?.agents?.defaults?.model);
  return (fallbacksOverride ?? defaultFallbacks).length > 0;
}

export function resolveEffectiveModelFallbacks(params: {
  cfg: RemoteClawConfig;
  agentId: string;
  hasSessionModelOverride: boolean;
}): string[] | undefined {
  const agentFallbacksOverride = resolveAgentModelFallbacksOverride(params.cfg, params.agentId);
  if (!params.hasSessionModelOverride) {
    return agentFallbacksOverride;
  }
  const defaultFallbacks = resolveAgentModelFallbackValues(params.cfg.agents?.defaults?.model);
  return agentFallbacksOverride ?? defaultFallbacks;
}

export function resolveAgentWorkspaceDir(cfg: RemoteClawConfig, agentId: string) {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.workspace?.trim();
  if (configured) {
    return stripNullBytes(resolveUserPath(configured));
  }
  const preferredAgentId = resolveDefaultAgentId(cfg);
  if (id === preferredAgentId) {
    const fallback = cfg.agents?.defaults?.workspace?.trim();
    if (fallback) {
      return stripNullBytes(resolveUserPath(fallback));
    }
    return stripNullBytes(resolveDefaultAgentWorkspaceDir(process.env));
  }
  const stateDir = resolveStateDir(process.env);
  return stripNullBytes(path.join(stateDir, `workspace-${id}`));
}

function normalizePathForComparison(input: string): string {
  const resolved = path.resolve(stripNullBytes(resolveUserPath(input)));
  let normalized = resolved;
  // Prefer realpath when available to normalize aliases/symlinks (for example /tmp -> /private/tmp)
  // and canonical path case without forcing case-folding on case-sensitive macOS volumes.
  try {
    normalized = fs.realpathSync.native(resolved);
  } catch {
    // Keep lexical path for non-existent directories.
  }
  if (process.platform === "win32") {
    return lowercasePreservingWhitespace(normalized);
  }
  return normalized;
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveAgentIdsByWorkspacePath(
  cfg: RemoteClawConfig,
  workspacePath: string,
): string[] {
  const normalizedWorkspacePath = normalizePathForComparison(workspacePath);
  const ids = listAgentIds(cfg);
  const matches: Array<{ id: string; workspaceDir: string; order: number }> = [];

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const workspaceDir = normalizePathForComparison(resolveAgentWorkspaceDir(cfg, id));
    if (!isPathWithinRoot(normalizedWorkspacePath, workspaceDir)) {
      continue;
    }
    matches.push({ id, workspaceDir, order: index });
  }

  matches.sort((left, right) => {
    const workspaceLengthDelta = right.workspaceDir.length - left.workspaceDir.length;
    if (workspaceLengthDelta !== 0) {
      return workspaceLengthDelta;
    }
    return left.order - right.order;
  });

  return matches.map((entry) => entry.id);
}

export function resolveAgentIdByWorkspacePath(
  cfg: RemoteClawConfig,
  workspacePath: string,
): string | undefined {
  return resolveAgentIdsByWorkspacePath(cfg, workspacePath)[0];
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

// ── Upstream-compat aliases ──────────────────────────────────────────
// The upstream sync introduced new function names that callers reference.
// These aliases map the new names to existing implementations.

/**
 * Alias: upstream introduced resolveSessionKeyAgentId.
 * Callers use positional args: (sessionKey, cfg).
 */
export function resolveSessionKeyAgentId(
  sessionKey: string | null | undefined | { sessionKey?: string; config?: RemoteClawConfig },
  cfg?: RemoteClawConfig,
): string {
  if (sessionKey && typeof sessionKey === "object") {
    return resolveSessionAgentId(sessionKey);
  }
  return resolveSessionAgentId({ sessionKey: sessionKey ?? undefined, config: cfg });
}

/**
 * Alias: upstream introduced resolveSoleAgentId.
 * Returns the agent ID only when exactly ONE agent is configured.
 * Returns null for empty config or multi-agent config.
 */
export function resolveSoleAgentId(
  cfgOrParams: RemoteClawConfig | { sessionKey?: string; config?: RemoteClawConfig },
): string | null {
  const cfg: RemoteClawConfig =
    cfgOrParams &&
    typeof cfgOrParams === "object" &&
    ("sessionKey" in cfgOrParams || "config" in cfgOrParams)
      ? ((cfgOrParams as { config?: RemoteClawConfig }).config ?? {})
      : (cfgOrParams as RemoteClawConfig);

  const agents = listAgentEntries(cfg);
  if (agents.length !== 1) {
    return null;
  }
  return normalizeAgentId(agents[0]?.id ?? DEFAULT_AGENT_ID);
}

/**
 * Alias: upstream introduced resolveFirstAgentWorkspace.
 * Returns null when no agents configured, when agents.list is empty,
 * or when no agent has a workspace. When agents have workspaces and
 * agents.defaults.workspace is set, returns defaults.workspace.
 * Otherwise returns the first agent's workspace from agents.list[0].
 */
export function resolveFirstAgentWorkspace(cfg: RemoteClawConfig): string | null {
  // If defaults.workspace is set, prefer it (even without agents.list)
  const defaultsWorkspace = cfg.agents?.defaults?.workspace?.trim();
  if (defaultsWorkspace) {
    return stripNullBytes(resolveUserPath(defaultsWorkspace));
  }

  const agents = listAgentEntries(cfg);
  if (agents.length === 0) {
    return null;
  }

  // Return the first agent's workspace
  const firstWorkspace = agents[0]?.workspace?.trim();
  if (!firstWorkspace) {
    return null;
  }
  return stripNullBytes(resolveUserPath(firstWorkspace));
}

/** Upstream-compat: resolveAgentWorkspaceDirOrNull returns null when workspace cannot be resolved. */
export function resolveAgentWorkspaceDirOrNull(
  cfg: RemoteClawConfig,
  agentId: string,
): string | null {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  if (!entry) {
    return null;
  }
  const configured = entry.workspace?.trim();
  if (!configured) {
    return null;
  }
  try {
    return stripNullBytes(resolveUserPath(configured));
  } catch {
    return null;
  }
}

// ── Fork-native runtime & auth resolvers ─────────────────────────────

/** Resolve per-agent runtime (fork-specific CLI runtime identifier). */
export function resolveAgentRuntime(cfg: RemoteClawConfig, agentId: string): string | undefined {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  const perAgent = entry?.runtime;
  if (typeof perAgent === "string") {
    return perAgent;
  }
  const defaultVal = (cfg.agents?.defaults as Record<string, unknown> | undefined)?.runtime;
  if (typeof defaultVal === "string") {
    return defaultVal;
  }
  return undefined;
}

/** Resolve per-agent runtime args (fork-specific CLI flags). */
export function resolveAgentRuntimeArgs(
  cfg: RemoteClawConfig,
  agentId: string,
): string[] | undefined {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  const perAgent = (entry as Record<string, unknown> | undefined)?.runtimeArgs;
  if (Array.isArray(perAgent)) {
    return perAgent as string[];
  }
  const defaultVal = (cfg.agents?.defaults as Record<string, unknown> | undefined)?.runtimeArgs;
  if (Array.isArray(defaultVal)) {
    return defaultVal as string[];
  }
  return undefined;
}

/** Resolve per-agent runtime env (fork-specific CLI env vars). */
export function resolveAgentRuntimeEnv(
  cfg: RemoteClawConfig,
  agentId: string,
): Record<string, string> | undefined {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  const perAgent = (entry as Record<string, unknown> | undefined)?.runtimeEnv;
  if (perAgent && typeof perAgent === "object" && !Array.isArray(perAgent)) {
    return perAgent as Record<string, string>;
  }
  const defaultVal = (cfg.agents?.defaults as Record<string, unknown> | undefined)?.runtimeEnv;
  if (defaultVal && typeof defaultVal === "object" && !Array.isArray(defaultVal)) {
    return defaultVal as Record<string, string>;
  }
  return undefined;
}

/**
 * Resolve per-agent runtime (CLI identifier) — throws if neither per-agent
 * config nor defaults define a runtime.
 */
export function resolveAgentRuntimeOrThrow(cfg: RemoteClawConfig, agentId: string): string {
  const runtime = resolveAgentRuntime(cfg, agentId);
  if (!runtime) {
    throw new Error(
      `No runtime configured for agent "${agentId}". Set agents.defaults.runtime to one of: claude, gemini, codex, opencode`,
    );
  }
  return runtime;
}

/** Resolve per-agent auth profile (fork-specific auth profile reference). */
export function resolveAgentAuth(
  cfg: RemoteClawConfig,
  agentId: string,
): string | string[] | false | undefined {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  const perAgent = (entry as Record<string, unknown> | undefined)?.auth;
  if (perAgent !== undefined) {
    return perAgent as string | string[] | false;
  }
  const defaultVal = (cfg.agents?.defaults as Record<string, unknown> | undefined)?.auth;
  if (defaultVal !== undefined) {
    return defaultVal as string | string[] | false;
  }
  return undefined;
}
