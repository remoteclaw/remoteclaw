import {
  applyProviderConfigWithDefaultModelPreset,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import {
  buildKimiCodingProvider,
  KIMI_CODING_BASE_URL,
  KIMI_CODING_DEFAULT_MODEL_ID,
} from "./provider-catalog.js";

export const KIMI_CODING_MODEL_REF = `kimi-coding/${KIMI_CODING_DEFAULT_MODEL_ID}`;

function resolveKimiCodingDefaultModel() {
  return buildKimiCodingProvider().models[0];
}

function applyKimiCodingPreset(cfg: RemoteClawConfig, primaryModelRef?: string): RemoteClawConfig {
  const defaultModel = resolveKimiCodingDefaultModel();
  if (!defaultModel) {
    return cfg;
  }
  return applyProviderConfigWithDefaultModelPreset(cfg, {
    providerId: "kimi",
    api: "anthropic-messages",
    baseUrl: KIMI_CODING_BASE_URL,
    defaultModel,
    defaultModelId: KIMI_CODING_DEFAULT_MODEL_ID,
    aliases: [{ modelRef: KIMI_MODEL_REF, alias: "Kimi" }],
    primaryModelRef,
  });
}

export function applyKimiCodeProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyKimiCodingPreset(cfg);
}

export function applyKimiCodeConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyKimiCodingPreset(cfg, KIMI_MODEL_REF);
}
