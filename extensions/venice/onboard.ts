import {
  buildVeniceModelDefinition,
  VENICE_BASE_URL,
  VENICE_DEFAULT_MODEL_REF,
  VENICE_MODEL_CATALOG,
} from "remoteclaw/plugin-sdk/provider-models";
import {
  applyProviderConfigWithModelCatalogPreset,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";

export { VENICE_DEFAULT_MODEL_REF };

function applyVenicePreset(cfg: RemoteClawConfig, primaryModelRef?: string): RemoteClawConfig {
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "venice",
    api: "openai-completions",
    baseUrl: VENICE_BASE_URL,
    catalogModels: VENICE_MODEL_CATALOG.map(buildVeniceModelDefinition),
    aliases: [{ modelRef: VENICE_DEFAULT_MODEL_REF, alias: "Kimi K2.5" }],
    primaryModelRef,
  });
}

export function applyVeniceProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyVenicePreset(cfg);
}

export function applyVeniceConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyVenicePreset(cfg, VENICE_DEFAULT_MODEL_REF);
}
