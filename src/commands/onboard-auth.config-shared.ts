import type { RemoteClawConfig } from "../config/config.js";
import type { AgentModelEntryConfig } from "../config/types.agent-defaults.js";

export function applyOnboardAuthAgentModelsAndProviders(
  cfg: RemoteClawConfig,
  params: {
    agentModels: Record<string, AgentModelEntryConfig>;
    providers?: Record<string, unknown>;
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

export function applyAgentDefaultModelPrimary(
  cfg: RemoteClawConfig,
  model: string,
): RemoteClawConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        model,
      },
    },
  };
}

export function applyProviderConfigWithDefaultModel(
  cfg: RemoteClawConfig,
  _params: unknown,
): RemoteClawConfig {
  return cfg;
}

export function applyProviderConfigWithDefaultModels(
  cfg: RemoteClawConfig,
  _params: unknown,
): RemoteClawConfig {
  return cfg;
}

export function applyProviderConfigWithModelCatalog(
  cfg: RemoteClawConfig,
  _params: unknown,
): RemoteClawConfig {
  return cfg;
}
