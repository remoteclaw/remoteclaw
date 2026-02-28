import type { OpenClawConfig } from "../config/config.js";
import { applyOnboardAuthAgentModelsAndProviders } from "./onboard-auth.config-shared.js";
import { LITELLM_DEFAULT_MODEL_REF } from "./onboard-auth.credentials.js";

export const LITELLM_BASE_URL = "http://localhost:4000";
export const LITELLM_DEFAULT_MODEL_ID = "claude-opus-4-6";

export function applyLitellmProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[LITELLM_DEFAULT_MODEL_REF] = {
    ...models[LITELLM_DEFAULT_MODEL_REF],
    alias: models[LITELLM_DEFAULT_MODEL_REF]?.alias ?? "LiteLLM",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyLitellmConfig(cfg: OpenClawConfig): OpenClawConfig {
  return applyLitellmProviderConfig(cfg);
}
