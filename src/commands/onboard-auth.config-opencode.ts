import type { RemoteClawConfig } from "../config/config.js";
import type { AgentDefaultsConfig } from "../config/types.agent-defaults.js";

const OPENCODE_ZEN_DEFAULT_MODEL_REF = "opencode/claude-opus-4-6";

export function applyOpencodeZenProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  // Use the built-in opencode provider; only seed the allowlist alias.
  const models = {
    ...((cfg.agents?.defaults as Record<string, unknown> | undefined)?.models as
      | Record<string, Record<string, unknown>>
      | undefined),
  };
  models[OPENCODE_ZEN_DEFAULT_MODEL_REF] = {
    ...models[OPENCODE_ZEN_DEFAULT_MODEL_REF],
    alias: models[OPENCODE_ZEN_DEFAULT_MODEL_REF]?.alias ?? "Opus",
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      } as AgentDefaultsConfig,
    },
  };
}

export function applyOpencodeZenConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyOpencodeZenProviderConfig(cfg);
}
