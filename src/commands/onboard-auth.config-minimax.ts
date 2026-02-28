import type { OpenClawConfig } from "../config/config.js";
import { toAgentModelListLike } from "../config/model-input.js";
import { applyOnboardAuthAgentModelsAndProviders } from "./onboard-auth.config-shared.js";
import {
  MINIMAX_API_BASE_URL,
  MINIMAX_CN_API_BASE_URL,
  MINIMAX_HOSTED_MODEL_REF,
} from "./onboard-auth.models.js";

export function applyMinimaxProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models["anthropic/claude-opus-4-6"] = {
    ...models["anthropic/claude-opus-4-6"],
    alias: models["anthropic/claude-opus-4-6"]?.alias ?? "Opus",
  };
  models["lmstudio/minimax-m2.1-gs32"] = {
    ...models["lmstudio/minimax-m2.1-gs32"],
    alias: models["lmstudio/minimax-m2.1-gs32"]?.alias ?? "Minimax",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyMinimaxHostedProviderConfig(
  cfg: OpenClawConfig,
  _params?: { baseUrl?: string },
): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[MINIMAX_HOSTED_MODEL_REF] = {
    ...models[MINIMAX_HOSTED_MODEL_REF],
    alias: models[MINIMAX_HOSTED_MODEL_REF]?.alias ?? "Minimax",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyMinimaxConfig(cfg: OpenClawConfig): OpenClawConfig {
  return applyMinimaxProviderConfig(cfg);
}

export function applyMinimaxHostedConfig(
  cfg: OpenClawConfig,
  params?: { baseUrl?: string },
): OpenClawConfig {
  const next = applyMinimaxHostedProviderConfig(cfg, params);
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...toAgentModelListLike(next.agents?.defaults?.model),
          primary: MINIMAX_HOSTED_MODEL_REF,
        },
      },
    },
  };
}

// MiniMax Anthropic-compatible API (platform.minimax.io/anthropic)
export function applyMinimaxApiProviderConfig(
  cfg: OpenClawConfig,
  modelId: string = "MiniMax-M2.5",
): OpenClawConfig {
  return applyMinimaxApiProviderConfigWithBaseUrl(cfg, {
    providerId: "minimax",
    modelId,
    baseUrl: MINIMAX_API_BASE_URL,
  });
}

export function applyMinimaxApiConfig(
  cfg: OpenClawConfig,
  modelId: string = "MiniMax-M2.5",
): OpenClawConfig {
  return applyMinimaxApiConfigWithBaseUrl(cfg, {
    providerId: "minimax",
    modelId,
    baseUrl: MINIMAX_API_BASE_URL,
  });
}

// MiniMax China API (api.minimaxi.com)
export function applyMinimaxApiProviderConfigCn(
  cfg: OpenClawConfig,
  modelId: string = "MiniMax-M2.5",
): OpenClawConfig {
  return applyMinimaxApiProviderConfigWithBaseUrl(cfg, {
    providerId: "minimax-cn",
    modelId,
    baseUrl: MINIMAX_CN_API_BASE_URL,
  });
}

export function applyMinimaxApiConfigCn(
  cfg: OpenClawConfig,
  modelId: string = "MiniMax-M2.5",
): OpenClawConfig {
  return applyMinimaxApiConfigWithBaseUrl(cfg, {
    providerId: "minimax-cn",
    modelId,
    baseUrl: MINIMAX_CN_API_BASE_URL,
  });
}

type MinimaxApiProviderConfigParams = {
  providerId: string;
  modelId: string;
  baseUrl: string;
};

function applyMinimaxApiProviderConfigWithBaseUrl(
  cfg: OpenClawConfig,
  params: MinimaxApiProviderConfigParams,
): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  const modelRef = `${params.providerId}/${params.modelId}`;
  models[modelRef] = {
    ...models[modelRef],
    alias: "Minimax",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

function applyMinimaxApiConfigWithBaseUrl(
  cfg: OpenClawConfig,
  params: MinimaxApiProviderConfigParams,
): OpenClawConfig {
  return applyMinimaxApiProviderConfigWithBaseUrl(cfg, params);
}
