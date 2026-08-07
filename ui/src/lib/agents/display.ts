import { formatByteSize } from "@remoteclaw/normalization-core";
import {
  listCoreToolSections,
  PROFILE_OPTIONS as TOOL_PROFILE_OPTIONS,
} from "../../../../src/agents/tool-catalog.js";
import {
  expandToolGroups,
  normalizeToolName,
  resolveToolProfilePolicy,
} from "../../../../src/agents/tool-policy-shared.js";
import type {
  AgentIdentityResult,
  AgentsFilesListResult,
  AgentsListResult,
} from "../../api/types.ts";
import { normalizeOptionalString } from "../string-coerce.ts";

export const TOOL_SECTIONS = listCoreToolSections();

export const PROFILE_OPTIONS = TOOL_PROFILE_OPTIONS;

type ToolPolicy = {
  allow?: string[];
  deny?: string[];
};

type AgentConfigEntry = {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

type ConfigSnapshot = {
  agents?: {
    defaults?: { workspace?: string };
    list?: AgentConfigEntry[];
  };
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

export function normalizeAgentLabel(agent: {
  id: string;
  name?: string;
  identity?: { name?: string };
}) {
  return (
    normalizeOptionalString(agent.name) ?? normalizeOptionalString(agent.identity?.name) ?? agent.id
  );
}

function isLikelyEmoji(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.length > 16) {
    return false;
  }
  let hasNonAscii = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charCodeAt(i) > 127) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) {
    return false;
  }
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".")) {
    return false;
  }
  return true;
}

export function resolveAgentEmoji(
  agent: { identity?: { emoji?: string; avatar?: string } },
  agentIdentity?: AgentIdentityResult | null,
) {
  const identityEmoji = normalizeOptionalString(agentIdentity?.emoji);
  if (identityEmoji && isLikelyEmoji(identityEmoji)) {
    return identityEmoji;
  }
  const agentEmoji = normalizeOptionalString(agent.identity?.emoji);
  if (agentEmoji && isLikelyEmoji(agentEmoji)) {
    return agentEmoji;
  }
  const identityAvatar = normalizeOptionalString(agentIdentity?.avatar);
  if (identityAvatar && isLikelyEmoji(identityAvatar)) {
    return identityAvatar;
  }
  const avatar = normalizeOptionalString(agent.identity?.avatar);
  if (avatar && isLikelyEmoji(avatar)) {
    return avatar;
  }
  return "";
}

export function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes)) {
    return "-";
  }
  return formatByteSize(bytes, {
    style: "legacy-binary",
    maxUnit: "tera",
    separator: " ",
    fractionDigits: (value, unit) => (unit === "byte" ? null : value < 10 ? 1 : 0),
  });
}

export function resolveAgentConfig(config: Record<string, unknown> | null, agentId: string) {
  const cfg = config as ConfigSnapshot | null;
  const list = cfg?.agents?.list ?? [];
  const entry = list.find((agent) => agent?.id === agentId);
  return {
    entry,
    defaults: cfg?.agents?.defaults,
    globalTools: cfg?.tools,
  };
}

export type AgentContext = {
  workspace: string;
  identityName: string;
  identityEmoji: string;
};

export function buildAgentContext(
  agent: AgentsListResult["agents"][number],
  configForm: Record<string, unknown> | null,
  agentFilesList: AgentsFilesListResult | null,
  agentIdentity?: AgentIdentityResult | null,
): AgentContext {
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace =
    workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const identityName =
    normalizeOptionalString(agent.identity?.name) ||
    normalizeOptionalString(agent.name) ||
    normalizeOptionalString(agentIdentity?.name) ||
    config.entry?.name ||
    agent.id;
  const identityEmoji = resolveAgentEmoji(agent, agentIdentity) || "-";
  return {
    workspace,
    identityName,
    identityEmoji,
  };
}

type CompiledPattern =
  | { kind: "all" }
  | { kind: "exact"; value: string }
  | { kind: "regex"; value: RegExp };

function compilePattern(pattern: string): CompiledPattern {
  const normalized = normalizeToolName(pattern);
  if (!normalized) {
    return { kind: "exact", value: "" };
  }
  if (normalized === "*") {
    return { kind: "all" };
  }
  if (!normalized.includes("*")) {
    return { kind: "exact", value: normalized };
  }
  const escaped = normalized.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  return { kind: "regex", value: new RegExp(`^${escaped.replaceAll("\\*", ".*")}$`) };
}

function compilePatterns(patterns?: string[]): CompiledPattern[] {
  if (!Array.isArray(patterns)) {
    return [];
  }
  return expandToolGroups(patterns)
    .map(compilePattern)
    .filter((pattern) => {
      return pattern.kind !== "exact" || pattern.value.length > 0;
    });
}

function matchesAny(name: string, patterns: CompiledPattern[]) {
  for (const pattern of patterns) {
    if (pattern.kind === "all") {
      return true;
    }
    if (pattern.kind === "exact" && name === pattern.value) {
      return true;
    }
    if (pattern.kind === "regex" && pattern.value.test(name)) {
      return true;
    }
  }
  return false;
}

export function isAllowedByPolicy(name: string, policy?: ToolPolicy) {
  if (!policy) {
    return true;
  }
  const normalized = normalizeToolName(name);
  const deny = compilePatterns(policy.deny);
  if (matchesAny(normalized, deny)) {
    return false;
  }
  const allow = compilePatterns(policy.allow);
  if (allow.length === 0) {
    return true;
  }
  if (matchesAny(normalized, allow)) {
    return true;
  }
  if (normalized === "apply_patch" && matchesAny("exec", allow)) {
    return true;
  }
  return false;
}

export function matchesList(name: string, list?: string[]) {
  if (!Array.isArray(list) || list.length === 0) {
    return false;
  }
  const normalized = normalizeToolName(name);
  const patterns = compilePatterns(list);
  if (matchesAny(normalized, patterns)) {
    return true;
  }
  if (normalized === "apply_patch" && matchesAny("exec", patterns)) {
    return true;
  }
  return false;
}

export function resolveToolProfile(profile: string) {
  return resolveToolProfilePolicy(profile) ?? undefined;
}

const CONTROL_UI_AVATAR_URL_RE = /^(data:image\/|\/(?!\/))/i;

export function isRenderableControlUiAvatarUrl(value: string): boolean {
  return CONTROL_UI_AVATAR_URL_RE.test(value);
}

export function resolveAgentAvatarUrl(
  agent: { identity?: { avatar?: string; avatarUrl?: string } },
  agentIdentity?: AgentIdentityResult | null,
): string | null {
  const candidates = [
    normalizeOptionalString(agentIdentity?.avatar),
    normalizeOptionalString(agent.identity?.avatarUrl),
    normalizeOptionalString(agent.identity?.avatar),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (isRenderableControlUiAvatarUrl(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Chat-render variant: accept `blob:` URLs (produced locally by
// `URL.createObjectURL` after an authenticated avatar fetch) in addition to
// config-sanitized candidates. The config path still gates untrusted
// http(s)/data sources through `resolveAgentAvatarUrl`.
export function resolveChatAvatarRenderUrl(
  candidate: string | null | undefined,
  agent: { identity?: { avatar?: string; avatarUrl?: string } },
  agentIdentity?: AgentIdentityResult | null,
): string | null {
  const trimmed = normalizeOptionalString(candidate);
  if (trimmed?.startsWith("blob:")) {
    return trimmed;
  }
  return resolveAgentAvatarUrl(agent, agentIdentity);
}

// Fork-only declarations re-attached after the ADR-0023 move merge
// dropped them; lifted verbatim from ui/src/ui/views/agents-utils.ts.
export function addModelId(target: Set<string>, value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  target.add(trimmed);
}

export function addModelConfigIds(target: Set<string>, modelConfig: unknown) {
  if (!modelConfig) {
    return;
  }
  if (typeof modelConfig === "string") {
    addModelId(target, modelConfig);
    return;
  }
  if (typeof modelConfig !== "object") {
    return;
  }
  const record = modelConfig as Record<string, unknown>;
  addModelId(target, record.primary);
  addModelId(target, record.model);
  addModelId(target, record.id);
  addModelId(target, record.value);
  const fallbacks = Array.isArray(record.fallbacks)
    ? record.fallbacks
    : Array.isArray(record.fallback)
      ? record.fallback
      : [];
  for (const fallback of fallbacks) {
    addModelId(target, fallback);
  }
}

export function resolveConfiguredCronModelSuggestions(
  configForm: Record<string, unknown> | null,
): string[] {
  if (!configForm || typeof configForm !== "object") {
    return [];
  }
  const agents = (configForm as { agents?: unknown }).agents;
  if (!agents || typeof agents !== "object") {
    return [];
  }
  const out = new Set<string>();
  const defaults = (agents as { defaults?: unknown }).defaults;
  if (defaults && typeof defaults === "object") {
    const defaultsRecord = defaults as Record<string, unknown>;
    addModelConfigIds(out, defaultsRecord.model);
    const defaultsModels = defaultsRecord.models;
    if (defaultsModels && typeof defaultsModels === "object") {
      for (const modelId of Object.keys(defaultsModels as Record<string, unknown>)) {
        addModelId(out, modelId);
      }
    }
  }
  const list = (agents as { list?: unknown }).list;
  if (list && typeof list === "object") {
    for (const entry of Object.values(list as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      addModelConfigIds(out, (entry as Record<string, unknown>).model);
    }
  }
  return sortLocaleStrings(out);
}

export function sortLocaleStrings(values: Iterable<string>): string[] {
  const sorted = Array.from(values);
  const buffer = Array.from({ length: sorted.length }, () => "");

  const merge = (left: number, middle: number, right: number): void => {
    let i = left;
    let j = middle;
    let k = left;
    while (i < middle && j < right) {
      buffer[k++] = sorted[i].localeCompare(sorted[j]) <= 0 ? sorted[i++] : sorted[j++];
    }
    while (i < middle) {
      buffer[k++] = sorted[i++];
    }
    while (j < right) {
      buffer[k++] = sorted[j++];
    }
    for (let idx = left; idx < right; idx += 1) {
      sorted[idx] = buffer[idx];
    }
  };

  const sortRange = (left: number, right: number): void => {
    if (right - left <= 1) {
      return;
    }

    const middle = (left + right) >>> 1;
    sortRange(left, middle);
    sortRange(middle, right);
    merge(left, middle, right);
  };

  sortRange(0, sorted.length);
  return sorted;
}
