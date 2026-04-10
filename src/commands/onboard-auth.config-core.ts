import type { RemoteClawConfig } from "../config/config.js";
import { KILOCODE_BASE_URL } from "../providers/kilocode-shared.js";
import {
  HUGGINGFACE_DEFAULT_MODEL_REF,
  KILOCODE_DEFAULT_MODEL_REF,
  MISTRAL_DEFAULT_MODEL_REF,
  OPENROUTER_DEFAULT_MODEL_REF,
  TOGETHER_DEFAULT_MODEL_REF,
  XIAOMI_DEFAULT_MODEL_REF,
  XAI_DEFAULT_MODEL_REF,
} from "./onboard-auth.credentials.js";
export {
  applyCloudflareAiGatewayConfig,
  applyCloudflareAiGatewayProviderConfig,
  applyVercelAiGatewayConfig,
  applyVercelAiGatewayProviderConfig,
} from "./onboard-auth.config-gateways.js";
export {
  applyLitellmConfig,
  applyLitellmProviderConfig,
  LITELLM_BASE_URL,
  LITELLM_DEFAULT_MODEL_ID,
} from "./onboard-auth.config-litellm.js";
import { applyOnboardAuthAgentModelsAndProviders } from "./onboard-auth.config-shared.js";
import {
  KIMI_CODING_MODEL_REF,
  MOONSHOT_DEFAULT_MODEL_REF,
  QIANFAN_DEFAULT_MODEL_REF,
  ZAI_DEFAULT_MODEL_ID,
} from "./onboard-auth.models.js";

export function applyZaiProviderConfig(
  cfg: RemoteClawConfig,
  params?: { endpoint?: string; modelId?: string },
): RemoteClawConfig {
  const modelId = params?.modelId?.trim() || ZAI_DEFAULT_MODEL_ID;
  const modelRef = `zai/${modelId}`;

  const models = { ...cfg.agents?.defaults?.models };
  models[modelRef] = {
    ...models[modelRef],
    alias: models[modelRef]?.alias ?? "GLM",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyZaiConfig(
  cfg: RemoteClawConfig,
  params?: { endpoint?: string; modelId?: string },
): RemoteClawConfig {
  return applyZaiProviderConfig(cfg, params);
}

export function applyOpenrouterProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[OPENROUTER_DEFAULT_MODEL_REF] = {
    ...models[OPENROUTER_DEFAULT_MODEL_REF],
    alias: models[OPENROUTER_DEFAULT_MODEL_REF]?.alias ?? "OpenRouter",
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models,
      },
    },
  };
}

export function applyOpenrouterConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyOpenrouterProviderConfig(cfg);
}

export function applyMoonshotProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[MOONSHOT_DEFAULT_MODEL_REF] = {
    ...models[MOONSHOT_DEFAULT_MODEL_REF],
    alias: models[MOONSHOT_DEFAULT_MODEL_REF]?.alias ?? "Kimi",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyMoonshotProviderConfigCn(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyMoonshotProviderConfig(cfg);
}

export function applyMoonshotConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyMoonshotProviderConfig(cfg);
}

export function applyMoonshotConfigCn(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyMoonshotProviderConfigCn(cfg);
}

export function applyKimiCodeProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[KIMI_CODING_MODEL_REF] = {
    ...models[KIMI_CODING_MODEL_REF],
    alias: models[KIMI_CODING_MODEL_REF]?.alias ?? "Kimi for Coding",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyKimiCodeConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyKimiCodeProviderConfig(cfg);
}

export function applySyntheticProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const syntheticModelRef = "synthetic/hf:MiniMaxAI/MiniMax-M2.1";
  const models = { ...cfg.agents?.defaults?.models };
  models[syntheticModelRef] = {
    ...models[syntheticModelRef],
    alias: models[syntheticModelRef]?.alias ?? "MiniMax M2.1",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applySyntheticConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applySyntheticProviderConfig(cfg);
}

export function applyXiaomiProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[XIAOMI_DEFAULT_MODEL_REF] = {
    ...models[XIAOMI_DEFAULT_MODEL_REF],
    alias: models[XIAOMI_DEFAULT_MODEL_REF]?.alias ?? "Xiaomi",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyXiaomiConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyXiaomiProviderConfig(cfg);
}

/**
 * Apply Venice provider configuration without changing the default model.
 * Registers Venice models and sets up the provider, but preserves existing model selection.
 */
export function applyVeniceProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const veniceModelRef = "venice/llama-3.3-70b";
  const models = { ...cfg.agents?.defaults?.models };
  models[veniceModelRef] = {
    ...models[veniceModelRef],
    alias: models[veniceModelRef]?.alias ?? "Llama 3.3 70B",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyVeniceConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyVeniceProviderConfig(cfg);
}

/**
 * Apply Together provider configuration without changing the default model.
 * Registers Together models and sets up the provider, but preserves existing model selection.
 */
export function applyTogetherProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[TOGETHER_DEFAULT_MODEL_REF] = {
    ...models[TOGETHER_DEFAULT_MODEL_REF],
    alias: models[TOGETHER_DEFAULT_MODEL_REF]?.alias ?? "Together AI",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyTogetherConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyTogetherProviderConfig(cfg);
}

/**
 * Apply Hugging Face (Inference Providers) provider configuration without changing the default model.
 */
export function applyHuggingfaceProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[HUGGINGFACE_DEFAULT_MODEL_REF] = {
    ...models[HUGGINGFACE_DEFAULT_MODEL_REF],
    alias: models[HUGGINGFACE_DEFAULT_MODEL_REF]?.alias ?? "Hugging Face",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyHuggingfaceConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyHuggingfaceProviderConfig(cfg);
}

export function applyXaiProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[XAI_DEFAULT_MODEL_REF] = {
    ...models[XAI_DEFAULT_MODEL_REF],
    alias: models[XAI_DEFAULT_MODEL_REF]?.alias ?? "Grok",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyXaiConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyXaiProviderConfig(cfg);
}

export function applyMistralProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[MISTRAL_DEFAULT_MODEL_REF] = {
    ...models[MISTRAL_DEFAULT_MODEL_REF],
    alias: models[MISTRAL_DEFAULT_MODEL_REF]?.alias ?? "Mistral",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyMistralConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyMistralProviderConfig(cfg);
}

export { KILOCODE_BASE_URL };

/**
 * Apply Kilo Gateway provider configuration without changing the default model.
 * Registers Kilo Gateway and sets up the provider, but preserves existing model selection.
 */
export function applyKilocodeProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[KILOCODE_DEFAULT_MODEL_REF] = {
    ...models[KILOCODE_DEFAULT_MODEL_REF],
    alias: models[KILOCODE_DEFAULT_MODEL_REF]?.alias ?? "Kilo Gateway",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyKilocodeConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyKilocodeProviderConfig(cfg);
}

export function applyAuthProfileConfig(
  cfg: RemoteClawConfig,
  params: {
    profileId: string;
    provider: string;
    mode: "api_key" | "oauth" | "token";
    email?: string;
    preferProfileFirst?: boolean;
  },
): RemoteClawConfig {
  const normalizedProvider = params.provider.toLowerCase();
  const profiles = {
    ...cfg.auth?.profiles,
    [params.profileId]: {
      provider: params.provider,
      mode: params.mode,
      ...(params.email ? { email: params.email } : {}),
    },
  };

  const configuredProviderProfiles = Object.entries(cfg.auth?.profiles ?? {})
    .filter(([, profile]) => profile.provider.toLowerCase() === normalizedProvider)
    .map(([profileId, profile]) => ({ profileId, mode: profile.mode }));

  // Maintain `auth.order` when it already exists. Additionally, if we detect
  // mixed auth modes for the same provider (e.g. legacy oauth + newly selected
  // api_key), create an explicit order to keep the newly selected profile first.
  const existingProviderOrder = cfg.auth?.order?.[params.provider];
  const preferProfileFirst = params.preferProfileFirst ?? true;
  const reorderedProviderOrder =
    existingProviderOrder && preferProfileFirst
      ? [
          params.profileId,
          ...existingProviderOrder.filter((profileId) => profileId !== params.profileId),
        ]
      : existingProviderOrder;
  const hasMixedConfiguredModes = configuredProviderProfiles.some(
    ({ profileId, mode }) => profileId !== params.profileId && mode !== params.mode,
  );
  const derivedProviderOrder =
    existingProviderOrder === undefined && preferProfileFirst && hasMixedConfiguredModes
      ? [
          params.profileId,
          ...configuredProviderProfiles
            .map(({ profileId }) => profileId)
            .filter((profileId) => profileId !== params.profileId),
        ]
      : undefined;
  const order =
    existingProviderOrder !== undefined
      ? {
          ...cfg.auth?.order,
          [params.provider]: reorderedProviderOrder?.includes(params.profileId)
            ? reorderedProviderOrder
            : [...(reorderedProviderOrder ?? []), params.profileId],
        }
      : derivedProviderOrder
        ? {
            ...cfg.auth?.order,
            [params.provider]: derivedProviderOrder,
          }
        : cfg.auth?.order;
  return {
    ...cfg,
    auth: {
      ...cfg.auth,
      profiles,
      ...(order ? { order } : {}),
    },
  };
}

export function applyQianfanProviderConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[QIANFAN_DEFAULT_MODEL_REF] = {
    ...models[QIANFAN_DEFAULT_MODEL_REF],
    alias: models[QIANFAN_DEFAULT_MODEL_REF]?.alias ?? "QIANFAN",
  };

  return applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels: models });
}

export function applyQianfanConfig(cfg: RemoteClawConfig): RemoteClawConfig {
  return applyQianfanProviderConfig(cfg);
}
