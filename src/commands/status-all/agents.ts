import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { loadSessionStore, resolveStorePath } from "../../config/sessions.js";
import { listAgentsForGateway } from "../../gateway/session-utils.js";

export async function getAgentLocalStatuses(cfg: RemoteClawConfig) {
  const agentList = listAgentsForGateway(cfg);
  const now = Date.now();

  const agents = await Promise.all(
    agentList.agents.map(async (agent) => {
      const workspaceDir = (() => {
        try {
          return resolveAgentWorkspaceDir(cfg, agent.id);
        } catch {
          return null;
        }
      })();
      const sessionsPath = resolveStorePath(cfg.session?.store, {
        agentId: agent.id,
      });
      const store = (() => {
        try {
          return loadSessionStore(sessionsPath);
        } catch {
          return {};
        }
      })();
      const updatedAt = Object.values(store).reduce(
        (max, entry) => Math.max(max, entry?.updatedAt ?? 0),
        0,
      );
      const lastUpdatedAt = updatedAt > 0 ? updatedAt : null;
      const lastActiveAgeMs = lastUpdatedAt ? now - lastUpdatedAt : null;
      const sessionsCount = Object.keys(store).filter(
        (k) => k !== "global" && k !== "unknown",
      ).length;
      return {
        id: agent.id,
        name: agent.name,
        workspaceDir,
        sessionsPath,
        sessionsCount,
        lastUpdatedAt,
        lastActiveAgeMs,
      };
    }),
  );

  const totalSessions = agents.reduce((sum, a) => sum + a.sessionsCount, 0);
  return {
    defaultId: agentList.defaultId,
    agents,
    totalSessions,
  };
}
