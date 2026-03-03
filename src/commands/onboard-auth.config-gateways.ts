import type { RemoteClawConfig } from "../config/config.js";
import { applyOnboardAuthAgentModelsAndProviders } from "./onboard-auth.config-shared.js";
import { VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF } from "./onboard-auth.credentials.js";

const CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF = "cloudflare-ai-gateway/claude-sonnet-4-5";

export function applyVercelAiGatewayProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF] = {
    ...models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF],
    alias: models[VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF]?.alias ?? "Vercel AI Gateway",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyCloudflareAiGatewayProviderConfig(
  cfg: RemoteClawConfig,
  _params?: { accountId?: string; gatewayId?: string },
): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF] = {
    ...models[CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF],
    alias: models[CLOUDFLARE_AI_GATEWAY_DEFAULT_MODEL_REF]?.alias ?? "Cloudflare AI Gateway",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyVercelAiGatewayConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyVercelAiGatewayProviderConfig(cfg);
}

export function applyCloudflareAiGatewayConfig(
  cfg: RemoteClawConfig,
  params?: { accountId?: string; gatewayId?: string },
): RemoteClawConfig {
  return applyCloudflareAiGatewayProviderConfig(cfg, params);
}
