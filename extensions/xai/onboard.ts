import {
  applyProviderConfigWithDefaultModelsPreset,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import { XAI_BASE_URL, XAI_DEFAULT_MODEL_ID } from "./model-definitions.js";
import { buildXaiCatalogModels } from "./model-definitions.js";

export const XAI_DEFAULT_MODEL_REF = `xai/${XAI_DEFAULT_MODEL_ID}`;

function applyXaiProviderConfigWithApi(
  cfg: RemoteClawConfig,
  api: "openai-completions" | "openai-responses",
  primaryModelRef?: string,
): RemoteClawConfig {
  return applyProviderConfigWithDefaultModelsPreset(cfg, {
    providerId: "xai",
    api: "openai-completions",
    baseUrl: XAI_BASE_URL,
    defaultModel: buildXaiModelDefinition(),
    defaultModelId: XAI_DEFAULT_MODEL_ID,
    aliases: [{ modelRef: XAI_DEFAULT_MODEL_REF, alias: "Grok" }],
    primaryModelRef,
  });
}

export function applyXaiProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyXaiProviderConfigWithApi(cfg, "openai-completions");
}

export function applyXaiResponsesApiConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyXaiProviderConfigWithApi(cfg, "openai-responses");
}

export function applyXaiConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyXaiProviderConfigWithApi(cfg, "openai-completions", XAI_DEFAULT_MODEL_REF);
}
