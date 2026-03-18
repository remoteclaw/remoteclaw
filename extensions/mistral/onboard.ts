import {
  applyProviderConfigWithDefaultModelPreset,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import {
  buildMistralModelDefinition,
  MISTRAL_BASE_URL,
  MISTRAL_DEFAULT_MODEL_ID,
} from "remoteclaw/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithDefaultModel,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";

export const MISTRAL_DEFAULT_MODEL_REF = `mistral/${MISTRAL_DEFAULT_MODEL_ID}`;

function applyMistralPreset(cfg: RemoteClawConfig, primaryModelRef?: string): RemoteClawConfig {
  return applyProviderConfigWithDefaultModelPreset(cfg, {
    providerId: "mistral",
    api: "openai-completions",
    baseUrl: MISTRAL_BASE_URL,
    defaultModel: buildMistralModelDefinition(),
    defaultModelId: MISTRAL_DEFAULT_MODEL_ID,
    aliases: [{ modelRef: MISTRAL_DEFAULT_MODEL_REF, alias: "Mistral" }],
    primaryModelRef,
  });
}

export function applyMistralProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyMistralPreset(cfg);
}

export function applyMistralConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyMistralPreset(cfg, MISTRAL_DEFAULT_MODEL_REF);
}
