import type { RemoteClawConfig } from "../../../src/config/types.remoteclaw.js";
import type { ProviderSystemPromptContributionContext } from "../../../src/plugins/types.js";

export const GPT5_CONTRACT_MODEL_ID = "gpt-5.4";
export const GPT5_PREFIXED_CONTRACT_MODEL_ID = "openai/gpt-5.4";
export const NON_GPT5_CONTRACT_MODEL_ID = "gpt-4.1";
export const OPENAI_CONTRACT_PROVIDER_ID = "openai";
export const OPENAI_CODEX_CONTRACT_PROVIDER_ID = "openai-codex";
export const CODEX_CONTRACT_PROVIDER_ID = "codex";
export const NON_OPENAI_CONTRACT_PROVIDER_ID = "openrouter";

export function openAiPluginPersonalityConfig(personality: "friendly" | "off"): RemoteClawConfig {
  return {
    plugins: {
      entries: {
        openai: {
          config: { personality },
        },
      },
    },
  } satisfies RemoteClawConfig;
}

export function sharedGpt5PersonalityConfig(personality: "friendly" | "off"): RemoteClawConfig {
  return {
    agents: {
      defaults: {
        promptOverlays: {
          gpt5: { personality },
        },
      },
    },
  } satisfies RemoteClawConfig;
}

export function codexPromptOverlayContext(params?: {
  modelId?: string;
  config?: RemoteClawConfig;
}): ProviderSystemPromptContributionContext {
  return {
    provider: CODEX_CONTRACT_PROVIDER_ID,
    modelId: params?.modelId ?? GPT5_CONTRACT_MODEL_ID,
    promptMode: "full",
    agentDir: "/tmp/remoteclaw-codex-prompt-contract-agent",
    workspaceDir: "/tmp/remoteclaw-codex-prompt-contract-workspace",
    ...(params?.config ? { config: params.config } : {}),
  };
}
