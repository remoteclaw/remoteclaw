import { normalizeApiKeyInput, validateApiKeyInput } from "./auth-choice.api-key.js";
import { ensureApiKeyFromOptionEnvOrPrompt } from "./auth-choice.apply-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthChoicePluginProvider } from "./auth-choice.apply.plugin-provider.js";
import {
  applyAuthProfileConfig,
  applyMinimaxApiConfig,
  applyMinimaxApiConfigCn,
  applyMinimaxConfig,
  setMinimaxApiKey,
} from "./onboard-auth.js";

export async function applyAuthChoiceMiniMax(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  let nextConfig = params.config;
  const ensureMinimaxApiKey = async (opts: {
    profileId: string;
    promptMessage: string;
  }): Promise<void> => {
    await ensureApiKeyFromOptionEnvOrPrompt({
      token: params.opts?.token,
      tokenProvider: params.opts?.tokenProvider,
      expectedProviders: ["minimax", "minimax-cn"],
      provider: "minimax",
      envLabel: "MINIMAX_API_KEY",
      promptMessage: opts.promptMessage,
      normalize: normalizeApiKeyInput,
      validate: validateApiKeyInput,
      prompter: params.prompter,
      setCredential: async (apiKey) => setMinimaxApiKey(apiKey, params.agentDir, opts.profileId),
    });
  };
  const applyMinimaxApiVariant = async (opts: {
    profileId: string;
    provider: "minimax" | "minimax-cn";
    promptMessage: string;
    modelId: string;
    applyDefaultConfig: (
      config: ApplyAuthChoiceParams["config"],
      modelId: string,
    ) => ApplyAuthChoiceParams["config"];
  }): Promise<ApplyAuthChoiceResult> => {
    await ensureMinimaxApiKey({
      profileId: opts.profileId,
      promptMessage: opts.promptMessage,
    });
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: opts.profileId,
      provider: opts.provider,
      mode: "api_key",
    });
    nextConfig = opts.applyDefaultConfig(nextConfig, opts.modelId);
    return { config: nextConfig };
  };
  if (params.authChoice === "minimax-portal") {
    // Let user choose between Global/CN endpoints
    const endpoint = await params.prompter.select({
      message: "Select MiniMax endpoint",
      options: [
        { value: "oauth", label: "Global", hint: "OAuth for international users" },
        { value: "oauth-cn", label: "CN", hint: "OAuth for users in China" },
      ],
    });

    return await applyAuthChoicePluginProvider(params, {
      authChoice: "minimax-portal",
      pluginId: "minimax-portal-auth",
      providerId: "minimax-portal",
      methodId: endpoint,
      label: "MiniMax",
    });
  }

  if (
    params.authChoice === "minimax-cloud" ||
    params.authChoice === "minimax-api" ||
    params.authChoice === "minimax-api-lightning"
  ) {
    return await applyMinimaxApiVariant({
      profileId: "minimax:default",
      provider: "minimax",
      promptMessage: "Enter MiniMax API key",
      modelId:
        params.authChoice === "minimax-api-lightning" ? "MiniMax-M2.5-Lightning" : "MiniMax-M2.5",
      applyDefaultConfig: applyMinimaxApiConfig,
    });
  }

  if (params.authChoice === "minimax-api-key-cn") {
    return await applyMinimaxApiVariant({
      profileId: "minimax-cn:default",
      provider: "minimax-cn",
      promptMessage: "Enter MiniMax China API key",
      modelId: "MiniMax-M2.5",
      applyDefaultConfig: applyMinimaxApiConfigCn,
    });
  }

  if (params.authChoice === "minimax") {
    nextConfig = applyMinimaxConfig(nextConfig);
    return { config: nextConfig };
  }

  return null;
}
