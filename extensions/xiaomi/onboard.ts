import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithDefaultModels,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import { buildXiaomiProvider, XIAOMI_DEFAULT_MODEL_ID } from "./provider-catalog.js";

export const XIAOMI_DEFAULT_MODEL_REF = `xiaomi/${XIAOMI_DEFAULT_MODEL_ID}`;

export function applyXiaomiProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[XIAOMI_DEFAULT_MODEL_REF] = {
    ...models[XIAOMI_DEFAULT_MODEL_REF],
    alias: models[XIAOMI_DEFAULT_MODEL_REF]?.alias ?? "Xiaomi",
  };
  const defaultProvider = buildXiaomiProvider();
  const resolvedApi = defaultProvider.api ?? "openai-completions";
  return applyProviderConfigWithDefaultModels(cfg, {
    agentModels: models,
    providerId: "xiaomi",
    api: resolvedApi,
    baseUrl: defaultProvider.baseUrl,
    defaultModels: defaultProvider.models ?? [],
    defaultModelId: XIAOMI_DEFAULT_MODEL_ID,
  });
}

export function applyXiaomiConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyAgentDefaultModelPrimary(applyXiaomiProviderConfig(cfg), XIAOMI_DEFAULT_MODEL_REF);
}
