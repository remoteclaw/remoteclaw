import type { RemoteClawConfig } from "../config/config.js";
import type { AgentModelEntryConfig } from "../config/types.agent-defaults.js";

export function applyOnboardAuthAgentModelsAndProviders(
  cfg: RemoteClawConfig,
  params: {
    agentModels: Record<string, AgentModelEntryConfig>;
  },
): RemoteClawConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: params.agentModels,
      },
    },
  };
}
