import type { OpenClawConfig } from "../config/config.js";
import { applyOnboardAuthAgentModelsAndProviders } from "./onboard-auth.config-shared.js";
import { VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF } from "./onboard-auth.credentials.js";

const CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF = "cloudflare-ai-gateway/claude-sonnet-4-5";

export function applyVercelAiGatewayProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF] = {
    ...models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF],
    alias: models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF]?.alias ?? "Vercel AI Gateway",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyCloudflareAiGatewayProviderConfig(
  cfg: OpenClawConfig,
  _params?: { accountId?: string; gatewayId?: string },
): OpenClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF] = {
    ...models[CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF],
    alias: models[CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF]?.alias ?? "Cloudflare AI Gateway",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyVercelAiGatewayConfig(cfg: OpenClawConfig): OpenClawConfig {
  return applyVercelAiGatewayProviderConfig(cfg);
}

export function applyCloudflareAiGatewayConfig(
  cfg: OpenClawConfig,
  params?: { accountId?: string; gatewayId?: string },
): OpenClawConfig {
  return applyCloudflareAiGatewayProviderConfig(cfg, params);
}
