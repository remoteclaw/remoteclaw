import { normalizeLowercaseStringOrEmpty } from "@remoteclaw/normalization-core/string-coerce";
import { uniqueStrings } from "@remoteclaw/normalization-core/string-normalization";
import {
  CORE_TOOL_GROUPS,
  resolveCoreToolProfilePolicy,
  type ToolProfileId,
} from "./tool-catalog.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  normalizeToolName: "live",
  couldNormalizeToolNamePrefixToAllowedTool: "live",
  normalizeToolList: "live",
  expandToolGroups: "live",
  resolveToolProfilePolicy: "live",
} as const;

type ToolProfilePolicy = {
  allow?: string[];
  deny?: string[];
};

const TOOL_NAME_ALIASES: Record<string, string> = {};

export const TOOL_GROUPS: Record<string, string[]> = { ...CORE_TOOL_GROUPS };

export function normalizeToolName(name: string) {
  const normalized = normalizeLowercaseStringOrEmpty(name);
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

export function couldNormalizeToolNamePrefixToAllowedTool(
  prefix: string,
  allowedToolNames: Set<string>,
): boolean {
  const normalizedPrefix = normalizeLowercaseStringOrEmpty(prefix);
  if (!normalizedPrefix) {
    return false;
  }

  const allowed = new Set<string>();
  for (const toolName of allowedToolNames) {
    const normalizedToolName = normalizeToolName(toolName);
    const foldedToolName = normalizeLowercaseStringOrEmpty(toolName);
    if (normalizedToolName) {
      allowed.add(normalizedToolName);
    }
    if (foldedToolName) {
      allowed.add(foldedToolName);
    }
    if (
      normalizedToolName.startsWith(normalizedPrefix) ||
      foldedToolName.startsWith(normalizedPrefix)
    ) {
      return true;
    }
  }

  const resolvedPrefix = normalizeToolName(normalizedPrefix);
  if (resolvedPrefix !== normalizedPrefix) {
    for (const toolName of allowed) {
      if (toolName.startsWith(resolvedPrefix)) {
        return true;
      }
    }
  }

  for (const [alias, toolName] of Object.entries(TOOL_NAME_ALIASES)) {
    if (alias.startsWith(normalizedPrefix) && allowed.has(toolName)) {
      return true;
    }
  }
  return false;
}

export function normalizeToolList(list?: string[]) {
  if (!list) {
    return [];
  }
  return list.map(normalizeToolName).filter(Boolean);
}

export function expandToolGroups(list?: string[]) {
  const normalized = normalizeToolList(list);
  const expanded: string[] = [];
  for (const value of normalized) {
    const group = TOOL_GROUPS[value];
    if (group) {
      expanded.push(...group);
      continue;
    }
    expanded.push(value);
  }
  return uniqueStrings(expanded);
}

export function resolveToolProfilePolicy(profile?: string): ToolProfilePolicy | undefined {
  return resolveCoreToolProfilePolicy(profile);
}

export type { ToolProfileId };
