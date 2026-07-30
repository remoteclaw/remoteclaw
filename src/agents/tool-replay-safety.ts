/**
 * Defines the narrow set of tool instances that blind attempt retries may repeat.
 */
import { normalizeToolName } from "./tool-policy-shared.js";

const UNCONDITIONALLY_REPLAY_SAFE_TOOL_NAMES = new Set([
  "read",
  "search",
  "find",
  "grep",
  "glob",
  "ls",
  "web_search",
  "web_fetch",
  "x_search",
  "memory_get",
  "sessions_list",
  "sessions_history",
  "agents_list",
  "get_goal",
  "update_plan",
  "tool_search",
  "tool_describe",
  "image",
]);

/**
 * Tool names are not ownership boundaries. Callers must reject plugin/channel
 * instances before using this audited core-tool allowlist.
 */
/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  isAgentToolReplaySafe: "live",
  collectReplaySafeToolNames: "live",
  isCoreToolNameReplaySafe: "live",
} as const;

export function isAgentToolReplaySafe(
  tool: { name?: string },
  options?: { declaredReplaySafe?: (tool: { name?: string }) => boolean | undefined },
): boolean {
  if (options?.declaredReplaySafe?.(tool) === false) {
    return false;
  }
  return UNCONDITIONALLY_REPLAY_SAFE_TOOL_NAMES.has(normalizeToolName(tool.name ?? ""));
}

/**
 * Name-only tool events are safe only when one concrete registered instance
 * owns the name. Duplicate/shadowed names fail closed.
 */
export function collectReplaySafeToolNames(
  tools: Array<{ name?: string }>,
  options?: { declaredReplaySafe?: (tool: { name?: string }) => boolean | undefined },
): Set<string> {
  const toolsByName = new Map<string, Array<{ name?: string }>>();
  for (const tool of tools) {
    const name = normalizeToolName(tool.name ?? "");
    if (!name) {
      continue;
    }
    const entries = toolsByName.get(name) ?? [];
    entries.push(tool);
    toolsByName.set(name, entries);
  }

  const replaySafeNames = new Set<string>();
  for (const [name, entries] of toolsByName) {
    const tool = entries.length === 1 ? entries[0] : undefined;
    if (tool && isAgentToolReplaySafe(tool, options)) {
      replaySafeNames.add(name);
    }
  }
  return replaySafeNames;
}

/** Test/fixture helper for constructing metadata for audited core tool names. */
export function isCoreToolNameReplaySafe(toolName: string): boolean {
  return UNCONDITIONALLY_REPLAY_SAFE_TOOL_NAMES.has(normalizeToolName(toolName));
}
