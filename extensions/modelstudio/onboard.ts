import {
  applyProviderConfigWithModelCatalogPreset,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import {
  MODELSTUDIO_CN_BASE_URL,
  MODELSTUDIO_DEFAULT_MODEL_REF,
  MODELSTUDIO_GLOBAL_BASE_URL,
} from "remoteclaw/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithModelCatalog,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";
import { buildModelStudioProvider } from "./provider-catalog.js";

export { MODELSTUDIO_CN_BASE_URL, MODELSTUDIO_DEFAULT_MODEL_REF, MODELSTUDIO_GLOBAL_BASE_URL };

function applyModelStudioProviderConfigWithBaseUrl(
  cfg: RemoteClawConfig,
  baseUrl: string,
  primaryModelRef?: string,
): RemoteClawConfig {
  const provider = buildModelStudioProvider();
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "modelstudio",
    api: provider.api ?? "openai-completions",
    baseUrl,
    catalogModels: provider.models ?? [],
    aliases: [
      ...(provider.models ?? []).map((model) => `modelstudio/${model.id}`),
      { modelRef: MODELSTUDIO_DEFAULT_MODEL_REF, alias: "Qwen" },
    ],
    primaryModelRef,
  });
}

export function applyModelStudioProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyModelStudioProviderConfigWithBaseUrl(cfg, MODELSTUDIO_GLOBAL_BASE_URL);
}

export function applyModelStudioProviderConfigCn(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyModelStudioProviderConfigWithBaseUrl(cfg, MODELSTUDIO_CN_BASE_URL);
}

export function applyModelStudioConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyModelStudioProviderConfigWithBaseUrl(
    cfg,
    MODELSTUDIO_GLOBAL_BASE_URL,
    MODELSTUDIO_DEFAULT_MODEL_REF,
  );
}

export function applyModelStudioConfigCn(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyModelStudioProviderConfigWithBaseUrl(
    cfg,
    MODELSTUDIO_CN_BASE_URL,
    MODELSTUDIO_DEFAULT_MODEL_REF,
  );
}
