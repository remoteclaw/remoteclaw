import {
  buildSyntheticModelDefinition,
  SYNTHETIC_BASE_URL,
  SYNTHETIC_DEFAULT_MODEL_REF,
  SYNTHETIC_MODEL_CATALOG,
} from "remoteclaw/plugin-sdk/provider-models";
import {
  applyProviderConfigWithModelCatalogPreset,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";

export { SYNTHETIC_DEFAULT_MODEL_REF };

function applySyntheticPreset(cfg: RemoteClawConfig, primaryModelRef?: string): RemoteClawConfig {
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "synthetic",
    api: "anthropic-messages",
    baseUrl: SYNTHETIC_BASE_URL,
    catalogModels: SYNTHETIC_MODEL_CATALOG.map(buildSyntheticModelDefinition),
    aliases: [{ modelRef: SYNTHETIC_DEFAULT_MODEL_REF, alias: "MiniMax M2.5" }],
    primaryModelRef,
  });
}

export function applySyntheticProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applySyntheticPreset(cfg);
}

export function applySyntheticConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applySyntheticPreset(cfg, SYNTHETIC_DEFAULT_MODEL_REF);
}
