import { OPENCODE_ZEN_DEFAULT_MODEL_REF } from "remoteclaw/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  withAgentModelAliases,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/provider-onboard";

export { OPENCODE_ZEN_DEFAULT_MODEL_REF };

export function applyOpencodeZenProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: withAgentModelAliases(cfg.agents?.defaults?.models, [
          { modelRef: OPENCODE_ZEN_DEFAULT_MODEL_REF, alias: "Opus" },
        ]),
      },
    },
  };
}

export function applyOpencodeZenConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyAgentDefaultModelPrimary(
    applyOpencodeZenProviderConfig(cfg),
    OPENCODE_ZEN_DEFAULT_MODEL_REF,
  );
}
