import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { listRouteBindings } from "../config/bindings.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { AgentRouteBinding } from "../config/types.agents.js";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import {
  normalizeRouteBindingChannelId,
  resolveNormalizedRouteBindingMatch,
} from "./binding-scope.js";
import { normalizeAgentId } from "./session-key.js";

export function listBindings(cfg: RemoteClawConfig): AgentRouteBinding[] {
  return listRouteBindings(cfg);
}

export function listBoundAccountIds(cfg: RemoteClawConfig, channelId: string): string[] {
  const normalizedChannel = normalizeRouteBindingChannelId(channelId);
  if (!normalizedChannel) {
    return [];
  }
  const ids = new Set<string>();
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedRouteBindingMatch(binding);
    if (!resolved || resolved.channelId !== normalizedChannel) {
      continue;
    }
    ids.add(resolved.accountId);
  }
  return Array.from(ids).toSorted((a, b) => a.localeCompare(b));
}

/**
 * Find the first account bound to the sole configured agent on a given channel.
 *
 * Returns `null` when there is no sole agent (zero or multiple agents configured)
 * or when no binding targets that agent on the requested channel. Multi-agent
 * configs have no implicit "default" agent — callers must disambiguate explicitly.
 */
export function resolveSoleAgentBoundAccountId(
  cfg: RemoteClawConfig,
  channelId: string,
): string | null {
  const normalizedChannel = normalizeRouteBindingChannelId(channelId);
  if (!normalizedChannel) {
    return null;
  }
  const soleAgentId = resolveSoleAgentId(cfg);
  if (!soleAgentId) {
    return null;
  }
  const normalizedSoleAgentId = normalizeAgentId(soleAgentId);
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedRouteBindingMatch(binding);
    if (
      !resolved ||
      resolved.channelId !== normalizedChannel ||
      resolved.agentId !== normalizedSoleAgentId
    ) {
      continue;
    }
    return resolved.accountId;
  }
  return null;
}

export function buildChannelAccountBindings(cfg: RemoteClawConfig) {
  const map = new Map<string, Map<string, string[]>>();
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedRouteBindingMatch(binding);
    if (!resolved) {
      continue;
    }
    const byAgent = map.get(resolved.channelId) ?? new Map<string, string[]>();
    const list = byAgent.get(resolved.agentId) ?? [];
    if (!list.includes(resolved.accountId)) {
      list.push(resolved.accountId);
    }
    byAgent.set(resolved.agentId, list);
    map.set(resolved.channelId, byAgent);
  }
  return map;
}

export function resolvePreferredAccountId(params: {
  accountIds: string[];
  defaultAccountId: string;
  boundAccounts: string[];
}): string {
  if (params.boundAccounts.length > 0) {
    return params.boundAccounts[0];
  }
  return params.defaultAccountId;
}
