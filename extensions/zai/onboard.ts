import {
  applyProviderConfigWithModelCatalogPreset,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import {
  buildZaiModelDefinition,
  resolveZaiBaseUrl,
  ZAI_DEFAULT_MODEL_ID,
} from "remoteclaw/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithModelCatalog,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";

export const ZAI_DEFAULT_MODEL_REF = `zai/${ZAI_DEFAULT_MODEL_ID}`;

const ZAI_DEFAULT_MODELS = [
  buildZaiModelDefinition({ id: "glm-5" }),
  buildZaiModelDefinition({ id: "glm-5-turbo" }),
  buildZaiModelDefinition({ id: "glm-4.7" }),
  buildZaiModelDefinition({ id: "glm-4.7-flash" }),
  buildZaiModelDefinition({ id: "glm-4.7-flashx" }),
];

function resolveZaiPresetBaseUrl(cfg: RemoteClawConfig, endpoint?: string): string {
  const existingProvider = cfg.models?.providers?.zai;
  const existingBaseUrl =
    typeof existingProvider?.baseUrl === "string" ? existingProvider.baseUrl.trim() : "";
  return endpoint ? resolveZaiBaseUrl(endpoint) : existingBaseUrl || resolveZaiBaseUrl();
}

function applyZaiPreset(
  cfg: RemoteClawConfig,
  params?: { endpoint?: string; modelId?: string },
  primaryModelRef?: string,
): RemoteClawConfig {
  const modelId = params?.modelId?.trim() || ZAI_DEFAULT_MODEL_ID;
  const modelRef = `zai/${modelId}`;
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "zai",
    api: "openai-completions",
    baseUrl: resolveZaiPresetBaseUrl(cfg, params?.endpoint),
    catalogModels: ZAI_DEFAULT_MODELS,
    aliases: [{ modelRef, alias: "GLM" }],
    primaryModelRef,
  });
}

export function applyZaiProviderConfig(
  cfg: RemoteClawConfig,
  params?: { endpoint?: string; modelId?: string },
): RemoteClawConfig {
  return applyZaiPreset(cfg, params);
}

export function applyZaiConfig(
  cfg: RemoteClawConfig,
  params?: { endpoint?: string; modelId?: string },
): RemoteClawConfig {
  const modelId = params?.modelId?.trim() || ZAI_DEFAULT_MODEL_ID;
  const modelRef = modelId === ZAI_DEFAULT_MODEL_ID ? ZAI_DEFAULT_MODEL_REF : `zai/${modelId}`;
  return applyZaiPreset(cfg, params, modelRef);
}
