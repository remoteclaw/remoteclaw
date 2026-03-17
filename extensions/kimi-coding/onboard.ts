import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithDefaultModel,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import {
  buildKimiCodingProvider,
  KIMI_CODING_BASE_URL,
  KIMI_CODING_DEFAULT_MODEL_ID,
} from "./provider-catalog.js";

export const KIMI_CODING_MODEL_REF = `kimi-coding/${KIMI_CODING_DEFAULT_MODEL_ID}`;

export function applyKimiCodeProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[KIMI_CODING_MODEL_REF] = {
    ...models[KIMI_CODING_MODEL_REF],
    alias: models[KIMI_CODING_MODEL_REF]?.alias ?? "Kimi",
  };

  const defaultModel = buildKimiCodingProvider().models[0];
  if (!defaultModel) {
    return cfg;
  }

  return applyProviderConfigWithDefaultModel(cfg, {
    agentModels: models,
    providerId: "kimi-coding",
    api: "anthropic-messages",
    baseUrl: KIMI_CODING_BASE_URL,
    defaultModel,
    defaultModelId: KIMI_CODING_DEFAULT_MODEL_ID,
  });
}

export function applyKimiCodeConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyAgentDefaultModelPrimary(applyKimiCodeProviderConfig(cfg), KIMI_CODING_MODEL_REF);
}
