import {
  listAgentEntries,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { IdentityConfig } from "../config/types.js";
import { normalizeAgentId } from "../routing/session-key.js";

export type AgentSummary = {
  id: string;
  name?: string;
  identityName?: string;
  identityEmoji?: string;
  workspace: string;
  agentDir: string;
  runtime?: string;
  bindings: number;
  bindingDetails?: string[];
  routes?: string[];
  providers?: string[];
  isDefault: boolean;
};

type AgentEntry = NonNullable<NonNullable<RemoteClawConfig["agents"]>["list"]>[number];

export { listAgentEntries };

export function findAgentEntryIndex(list: AgentEntry[], agentId: string): number {
  const id = normalizeAgentId(agentId);
  return list.findIndex((entry) => normalizeAgentId(entry.id) === id);
}

function resolveAgentName(cfg: RemoteClawConfig, agentId: string) {
  const entry = listAgentEntries(cfg).find(
    (agent) => normalizeAgentId(agent.id) === normalizeAgentId(agentId),
  );
  return entry?.name?.trim() || undefined;
}

function resolveAgentRuntimeLabel(cfg: RemoteClawConfig, agentId: string): string | undefined {
  const entry = listAgentEntries(cfg).find(
    (agent) => normalizeAgentId(agent.id) === normalizeAgentId(agentId),
  );
  return entry?.runtime ?? cfg.agents?.defaults?.runtime ?? undefined;
}

export function buildAgentSummaries(cfg: RemoteClawConfig): AgentSummary[] {
  const defaultAgentId = normalizeAgentId(resolveDefaultAgentId(cfg));
  const configuredAgents = listAgentEntries(cfg);
  const orderedIds =
    configuredAgents.length > 0
      ? configuredAgents.map((agent) => normalizeAgentId(agent.id))
      : [defaultAgentId];
  const bindingCounts = new Map<string, number>();
  for (const binding of cfg.bindings ?? []) {
    const agentId = normalizeAgentId(binding.agentId);
    bindingCounts.set(agentId, (bindingCounts.get(agentId) ?? 0) + 1);
  }

  const ordered = orderedIds.filter((id, index) => orderedIds.indexOf(id) === index);

  return ordered.map((id) => {
    const workspace = resolveAgentWorkspaceDir(cfg, id);
    const configIdentity = configuredAgents.find(
      (agent) => normalizeAgentId(agent.id) === id,
    )?.identity;
    const identityName = configIdentity?.name?.trim();
    const identityEmoji = configIdentity?.emoji?.trim();
    return {
      id,
      name: resolveAgentName(cfg, id),
      identityName,
      identityEmoji,
      workspace,
      agentDir: resolveAgentDir(cfg, id),
      runtime: resolveAgentRuntimeLabel(cfg, id),
      bindings: bindingCounts.get(id) ?? 0,
      isDefault: id === defaultAgentId,
    };
  });
}

export function applyAgentConfig(
  cfg: RemoteClawConfig,
  params: {
    agentId: string;
    name?: string;
    workspace?: string;
    agentDir?: string;
    identity?: IdentityConfig;
    runtime?: AgentEntry["runtime"];
  },
): RemoteClawConfig {
  const agentId = normalizeAgentId(params.agentId);
  const name = params.name?.trim();
  const list = listAgentEntries(cfg);
  const index = findAgentEntryIndex(list, agentId);
  const base = index >= 0 ? list[index] : { id: agentId };
  const nextIdentity = params.identity ? { ...base.identity, ...params.identity } : base.identity;
  const nextEntry: AgentEntry = {
    ...base,
    ...(name ? { name } : {}),
    ...(params.workspace ? { workspace: params.workspace } : {}),
    ...(params.agentDir ? { agentDir: params.agentDir } : {}),
    ...(nextIdentity ? { identity: nextIdentity } : {}),
    ...(params.runtime ? { runtime: params.runtime } : {}),
  };
  const nextList = [...list];
  if (index >= 0) {
    nextList[index] = nextEntry;
  } else {
    if (nextList.length === 0 && agentId !== normalizeAgentId(resolveDefaultAgentId(cfg))) {
      nextList.push({ id: resolveDefaultAgentId(cfg) });
    }
    nextList.push(nextEntry);
  }
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: nextList,
    },
  };
}

export function pruneAgentConfig(
  cfg: RemoteClawConfig,
  agentId: string,
): {
  config: RemoteClawConfig;
  removedBindings: number;
  removedAllow: number;
} {
  const id = normalizeAgentId(agentId);
  const agents = listAgentEntries(cfg);
  const nextAgentsList = agents.filter((entry) => normalizeAgentId(entry.id) !== id);
  const nextAgents = nextAgentsList.length > 0 ? nextAgentsList : undefined;

  const bindings = cfg.bindings ?? [];
  const filteredBindings = bindings.filter((binding) => normalizeAgentId(binding.agentId) !== id);

  const allow = cfg.tools?.agentToAgent?.allow ?? [];
  const filteredAllow = allow.filter((entry) => entry !== id);

  const nextAgentsConfig = cfg.agents
    ? { ...cfg.agents, list: nextAgents }
    : nextAgents
      ? { list: nextAgents }
      : undefined;
  const nextTools = cfg.tools?.agentToAgent
    ? {
        ...cfg.tools,
        agentToAgent: {
          ...cfg.tools.agentToAgent,
          allow: filteredAllow.length > 0 ? filteredAllow : undefined,
        },
      }
    : cfg.tools;

  return {
    config: {
      ...cfg,
      agents: nextAgentsConfig,
      bindings: filteredBindings.length > 0 ? filteredBindings : undefined,
      tools: nextTools,
    },
    removedBindings: bindings.length - filteredBindings.length,
    removedAllow: allow.length - filteredAllow.length,
  };
}
