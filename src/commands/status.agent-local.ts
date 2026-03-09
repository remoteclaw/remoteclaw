import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import { listAgentsForGateway } from "../gateway/session-utils.js";

export type AgentLocalStatus = {
  id: string;
  name?: string;
  workspaceDir: string | null;
  sessionsPath: string;
  sessionsCount: number;
  lastUpdatedAt: number | null;
  lastActiveAgeMs: number | null;
};

export async function getAgentLocalStatuses(): Promise<{
  defaultId: string;
  agents: AgentLocalStatus[];
  totalSessions: number;
}> {
  const cfg = loadConfig();
  const agentList = listAgentsForGateway(cfg);
  const now = Date.now();

  const statuses: AgentLocalStatus[] = [];
  for (const agent of agentList.agents) {
    const agentId = agent.id;
    const workspaceDir = (() => {
      try {
        return resolveAgentWorkspaceDir(cfg, agentId);
      } catch {
        return null;
      }
    })();

    const sessionsPath = resolveStorePath(cfg.session?.store, { agentId });
    const store = (() => {
      try {
        return loadSessionStore(sessionsPath);
      } catch {
        return {};
      }
    })();
    const sessions = Object.entries(store)
      .filter(([key]) => key !== "global" && key !== "unknown")
      .map(([, entry]) => entry);
    const sessionsCount = sessions.length;
    const lastUpdatedAt = sessions.reduce((max, e) => Math.max(max, e?.updatedAt ?? 0), 0);
    const resolvedLastUpdatedAt = lastUpdatedAt > 0 ? lastUpdatedAt : null;
    const lastActiveAgeMs = resolvedLastUpdatedAt ? now - resolvedLastUpdatedAt : null;

    statuses.push({
      id: agentId,
      name: agent.name,
      workspaceDir,
      sessionsPath,
      sessionsCount,
      lastUpdatedAt: resolvedLastUpdatedAt,
      lastActiveAgeMs,
    });
  }

  const totalSessions = statuses.reduce((sum, s) => sum + s.sessionsCount, 0);
  return {
    defaultId: agentList.defaultId,
    agents: statuses,
    totalSessions,
  };
}
