import { ensureAuthProfileStore, resolveAuthProfileOrder } from "../agents/auth-profiles.js";
import { resolveEnvApiKey } from "../agents/model-auth.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import {
  ensureApiKeyFromOptionEnvOrPrompt,
  normalizeTokenProviderInput,
} from "./auth-choice.apply-helpers.js";
import { applyAuthChoiceHuggingface } from "./auth-choice.apply.huggingface.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthChoiceOpenRouter } from "./auth-choice.apply.openrouter.js";
import {
  applyAuthProfileConfig,
  applyCloudflareAiGatewayConfig,
  applyKilocodeConfig,
  applyQianfanConfig,
  applyKimiCodeConfig,
  applyLitellmConfig,
  applyMistralConfig,
  applyMoonshotConfig,
  applyMoonshotConfigCn,
  applyOpencodeZenConfig,
  applySyntheticConfig,
  applyTogetherConfig,
  applyVeniceConfig,
  applyVercelAiGatewayConfig,
  applyXiaomiConfig,
  applyZaiConfig,
  setCloudflareAiGatewayConfig,
  setQianfanApiKey,
  setGeminiApiKey,
  setKilocodeApiKey,
  setLitellmApiKey,
  setKimiCodingApiKey,
  setMistralApiKey,
  setMoonshotApiKey,
  setOpencodeZenApiKey,
  setSyntheticApiKey,
  setTogetherApiKey,
  setVeniceApiKey,
  setVercelAiGatewayApiKey,
  setXiaomiApiKey,
  setZaiApiKey,
} from "./onboard-auth.js";
import type { AuthChoice } from "./onboard-types.js";
import { detectZaiEndpoint } from "./zai-endpoint-detect.js";

const API_KEY_TOKEN_PROVIDER_AUTH_CHOICE: Record<string, AuthChoice> = {
  openrouter: "openrouter-api-key",
  litellm: "litellm-api-key",
  "vercel-ai-gateway": "ai-gateway-api-key",
  "cloudflare-ai-gateway": "cloudflare-ai-gateway-api-key",
  moonshot: "moonshot-api-key",
  "kimi-code": "kimi-code-api-key",
  "kimi-coding": "kimi-code-api-key",
  google: "gemini-api-key",
  zai: "zai-api-key",
  xiaomi: "xiaomi-api-key",
  synthetic: "synthetic-api-key",
  venice: "venice-api-key",
  together: "together-api-key",
  huggingface: "huggingface-api-key",
  mistral: "mistral-api-key",
  opencode: "opencode-zen",
  kilocode: "kilocode-api-key",
  qianfan: "qianfan-api-key",
};

const ZAI_AUTH_CHOICE_ENDPOINT: Partial<
  Record<AuthChoice, "global" | "cn" | "coding-global" | "coding-cn">
> = {
  "zai-coding-global": "coding-global",
  "zai-coding-cn": "coding-cn",
  "zai-global": "global",
  "zai-cn": "cn",
};

type ApiKeyProviderConfigApplier = (
  config: ApplyAuthChoiceParams["config"],
) => ApplyAuthChoiceParams["config"];

type SimpleApiKeyProviderFlow = {
  provider: Parameters<typeof ensureApiKeyFromOptionEnvOrPrompt>[0]["provider"];
  profileId: string;
  expectedProviders: string[];
  envLabel: string;
  promptMessage: string;
  setCredential: (apiKey: string, agentDir?: string) => void | Promise<void>;
  applyConfig: ApiKeyProviderConfigApplier;
  tokenProvider?: string;
  normalize?: (value: string) => string;
  validate?: (value: string) => string | undefined;
  noteMessage?: string;
  noteTitle?: string;
};

const SIMPLE_API_KEY_PROVIDER_FLOWS: Partial<Record<AuthChoice, SimpleApiKeyProviderFlow>> = {
  "ai-gateway-api-key": {
    provider: "vercel-ai-gateway",
    profileId: "vercel-ai-gateway:default",
    expectedProviders: ["vercel-ai-gateway"],
    envLabel: "AI_GATEWAY_API_KEY",
    promptMessage: "Enter Vercel AI Gateway API key",
    setCredential: setVercelAiGatewayApiKey,
    applyConfig: applyVercelAiGatewayConfig,
  },
  "moonshot-api-key": {
    provider: "moonshot",
    profileId: "moonshot:default",
    expectedProviders: ["moonshot"],
    envLabel: "MOONSHOT_API_KEY",
    promptMessage: "Enter Moonshot API key",
    setCredential: setMoonshotApiKey,
    applyConfig: applyMoonshotConfig,
  },
  "moonshot-api-key-cn": {
    provider: "moonshot",
    profileId: "moonshot:default",
    expectedProviders: ["moonshot"],
    envLabel: "MOONSHOT_API_KEY",
    promptMessage: "Enter Moonshot API key (.cn)",
    setCredential: setMoonshotApiKey,
    applyConfig: applyMoonshotConfigCn,
  },
  "kimi-code-api-key": {
    provider: "kimi-coding",
    profileId: "kimi-coding:default",
    expectedProviders: ["kimi-code", "kimi-coding"],
    envLabel: "KIMI_API_KEY",
    promptMessage: "Enter Kimi Coding API key",
    setCredential: setKimiCodingApiKey,
    applyConfig: applyKimiCodeConfig,
    noteMessage: [
      "Kimi Coding uses a dedicated endpoint and API key.",
      "Get your API key at: https://www.kimi.com/code/en",
    ].join("\n"),
    noteTitle: "Kimi Coding",
  },
  "xiaomi-api-key": {
    provider: "xiaomi",
    profileId: "xiaomi:default",
    expectedProviders: ["xiaomi"],
    envLabel: "XIAOMI_API_KEY",
    promptMessage: "Enter Xiaomi API key",
    setCredential: setXiaomiApiKey,
    applyConfig: applyXiaomiConfig,
  },
  "mistral-api-key": {
    provider: "mistral",
    profileId: "mistral:default",
    expectedProviders: ["mistral"],
    envLabel: "MISTRAL_API_KEY",
    promptMessage: "Enter Mistral API key",
    setCredential: setMistralApiKey,
    applyConfig: applyMistralConfig,
  },
  "venice-api-key": {
    provider: "venice",
    profileId: "venice:default",
    expectedProviders: ["venice"],
    envLabel: "VENICE_API_KEY",
    promptMessage: "Enter Venice AI API key",
    setCredential: setVeniceApiKey,
    applyConfig: applyVeniceConfig,
    noteMessage: [
      "Venice AI provides privacy-focused inference with uncensored models.",
      "Get your API key at: https://venice.ai/settings/api",
      "Supports 'private' (fully private) and 'anonymized' (proxy) modes.",
    ].join("\n"),
    noteTitle: "Venice AI",
  },
  "opencode-zen": {
    provider: "opencode",
    profileId: "opencode:default",
    expectedProviders: ["opencode"],
    envLabel: "OPENCODE_API_KEY",
    promptMessage: "Enter OpenCode Zen API key",
    setCredential: setOpencodeZenApiKey,
    applyConfig: applyOpencodeZenConfig,
    noteMessage: [
      "OpenCode Zen provides access to Claude, GPT, Gemini, and more models.",
      "Get your API key at: https://opencode.ai/auth",
      "OpenCode Zen bills per request. Check your OpenCode dashboard for details.",
    ].join("\n"),
    noteTitle: "OpenCode Zen",
  },
  "together-api-key": {
    provider: "together",
    profileId: "together:default",
    expectedProviders: ["together"],
    envLabel: "TOGETHER_API_KEY",
    promptMessage: "Enter Together AI API key",
    setCredential: setTogetherApiKey,
    applyConfig: applyTogetherConfig,
    noteMessage: [
      "Together AI provides access to leading open-source models including Llama, DeepSeek, Qwen, and more.",
      "Get your API key at: https://api.together.xyz/settings/api-keys",
    ].join("\n"),
    noteTitle: "Together AI",
  },
  "qianfan-api-key": {
    provider: "qianfan",
    profileId: "qianfan:default",
    expectedProviders: ["qianfan"],
    envLabel: "QIANFAN_API_KEY",
    promptMessage: "Enter QIANFAN API key",
    setCredential: setQianfanApiKey,
    applyConfig: applyQianfanConfig,
    noteMessage: [
      "Get your API key at: https://console.bce.baidu.com/qianfan/ais/console/apiKey",
      "API key format: bce-v3/ALTAK-...",
    ].join("\n"),
    noteTitle: "QIANFAN",
  },
  "kilocode-api-key": {
    provider: "kilocode",
    profileId: "kilocode:default",
    expectedProviders: ["kilocode"],
    envLabel: "KILOCODE_API_KEY",
    promptMessage: "Enter Kilo Gateway API key",
    setCredential: setKilocodeApiKey,
    applyConfig: applyKilocodeConfig,
  },
  "synthetic-api-key": {
    provider: "synthetic",
    profileId: "synthetic:default",
    expectedProviders: ["synthetic"],
    envLabel: "SYNTHETIC_API_KEY",
    promptMessage: "Enter Synthetic API key",
    setCredential: setSyntheticApiKey,
    applyConfig: applySyntheticConfig,
    normalize: (value) => String(value ?? "").trim(),
    validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
  },
};

export async function applyAuthChoiceApiProviders(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  let nextConfig = params.config;

  let authChoice = params.authChoice;
  const normalizedTokenProvider = normalizeTokenProviderInput(params.opts?.tokenProvider);
  if (authChoice === "apiKey" && params.opts?.tokenProvider) {
    if (normalizedTokenProvider !== "anthropic" && normalizedTokenProvider !== "openai") {
      authChoice = API_KEY_TOKEN_PROVIDER_AUTH_CHOICE[normalizedTokenProvider ?? ""] ?? authChoice;
    }
  }

  async function applyApiKeyProvider({
    provider,
    profileId,
    expectedProviders,
    envLabel,
    promptMessage,
    setCredential,
    applyConfig,
    noteMessage,
    noteTitle,
    tokenProvider = normalizedTokenProvider,
    normalize = normalizeApiKeyInput,
    validate = validateApiKeyInput,
  }: {
    provider: Parameters<typeof ensureApiKeyFromOptionEnvOrPrompt>[0]["provider"];
    profileId: string;
    expectedProviders: string[];
    envLabel: string;
    promptMessage: string;
    setCredential: (apiKey: string) => void | Promise<void>;
    applyConfig: (config: ApplyAuthChoiceParams["config"]) => ApplyAuthChoiceParams["config"];
    noteMessage?: string;
    noteTitle?: string;
    tokenProvider?: string;
    normalize?: (value: string) => string;
    validate?: (value: string) => string | undefined;
  }): Promise<ApplyAuthChoiceResult> {
    await ensureApiKeyFromOptionEnvOrPrompt({
      token: params.opts?.token,
      provider,
      tokenProvider,
      expectedProviders,
      envLabel,
      promptMessage,
      setCredential: async (apiKey) => {
        await setCredential(apiKey);
      },
      noteMessage,
      noteTitle,
      normalize,
      validate,
      prompter: params.prompter,
    });

    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId,
      provider,
      mode: "api_key",
    });
    nextConfig = applyConfig(nextConfig);

    return { config: nextConfig };
  }

  if (authChoice === "openrouter-api-key") {
    return applyAuthChoiceOpenRouter(params);
  }

  if (authChoice === "litellm-api-key") {
    const store = ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false });
    const profileOrder = resolveAuthProfileOrder({ cfg: nextConfig, store, provider: "litellm" });
    const existingProfileId = profileOrder.find((profileId) => Boolean(store.profiles[profileId]));
    const existingCred = existingProfileId ? store.profiles[existingProfileId] : undefined;
    let profileId = "litellm:default";
    let hasCredential = Boolean(existingProfileId && existingCred?.type === "api_key");
    if (hasCredential && existingProfileId) {
      profileId = existingProfileId;
    }

    if (!hasCredential) {
      await ensureApiKeyFromOptionEnvOrPrompt({
        token: params.opts?.token,
        tokenProvider: normalizedTokenProvider,
        expectedProviders: ["litellm"],
        provider: "litellm",
        envLabel: "LITELLM_API_KEY",
        promptMessage: "Enter LiteLLM API key",
        normalize: normalizeApiKeyInput,
        validate: validateApiKeyInput,
        prompter: params.prompter,
        setCredential: async (apiKey) => setLitellmApiKey(apiKey, params.agentDir),
        noteMessage:
          "LiteLLM provides a unified API to 100+ LLM providers.\nGet your API key from your LiteLLM proxy or https://litellm.ai\nDefault proxy runs on http://localhost:4000",
        noteTitle: "LiteLLM",
      });
      hasCredential = true;
    }

    if (hasCredential) {
      nextConfig = applyAuthProfileConfig(nextConfig, {
        profileId,
        provider: "litellm",
        mode: "api_key",
      });
    }
    nextConfig = applyLitellmConfig(nextConfig);
    return { config: nextConfig };
  }

  const simpleApiKeyProviderFlow = SIMPLE_API_KEY_PROVIDER_FLOWS[authChoice];
  if (simpleApiKeyProviderFlow) {
    return await applyApiKeyProvider({
      provider: simpleApiKeyProviderFlow.provider,
      profileId: simpleApiKeyProviderFlow.profileId,
      expectedProviders: simpleApiKeyProviderFlow.expectedProviders,
      envLabel: simpleApiKeyProviderFlow.envLabel,
      promptMessage: simpleApiKeyProviderFlow.promptMessage,
      setCredential: async (apiKey) =>
        simpleApiKeyProviderFlow.setCredential(apiKey, params.agentDir),
      applyConfig: simpleApiKeyProviderFlow.applyConfig,
      noteMessage: simpleApiKeyProviderFlow.noteMessage,
      noteTitle: simpleApiKeyProviderFlow.noteTitle,
      tokenProvider: simpleApiKeyProviderFlow.tokenProvider,
      normalize: simpleApiKeyProviderFlow.normalize,
      validate: simpleApiKeyProviderFlow.validate,
    });
  }

  if (authChoice === "cloudflare-ai-gateway-api-key") {
    let accountId = params.opts?.cloudflareAiGatewayAccountId?.trim() ?? "";
    let gatewayId = params.opts?.cloudflareAiGatewayGatewayId?.trim() ?? "";

    const ensureAccountGateway = async () => {
      if (!accountId) {
        const value = await params.prompter.text({
          message: "Enter Cloudflare Account ID",
          validate: (val) => (String(val ?? "").trim() ? undefined : "Account ID is required"),
        });
        accountId = String(value ?? "").trim();
      }
      if (!gatewayId) {
        const value = await params.prompter.text({
          message: "Enter Cloudflare AI Gateway ID",
          validate: (val) => (String(val ?? "").trim() ? undefined : "Gateway ID is required"),
        });
        gatewayId = String(value ?? "").trim();
      }
    };

    const optsApiKey = normalizeApiKeyInput(params.opts?.cloudflareAiGatewayApiKey ?? "");
    let resolvedApiKey = "";
    if (accountId && gatewayId && optsApiKey) {
      resolvedApiKey = optsApiKey;
    }

    const envKey = resolveEnvApiKey("cloudflare-ai-gateway");
    if (!resolvedApiKey && envKey) {
      const useExisting = await params.prompter.confirm({
        message: `Use existing CLOUDFLARE_AI_GATEWAY_API_KEY (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
        initialValue: true,
      });
      if (useExisting) {
        await ensureAccountGateway();
        resolvedApiKey = normalizeApiKeyInput(envKey.apiKey);
      }
    }

    if (!resolvedApiKey && optsApiKey) {
      await ensureAccountGateway();
      resolvedApiKey = optsApiKey;
    }

    if (!resolvedApiKey) {
      await ensureAccountGateway();
      const key = await params.prompter.text({
        message: "Enter Cloudflare AI Gateway API key",
        validate: validateApiKeyInput,
      });
      resolvedApiKey = normalizeApiKeyInput(String(key ?? ""));
    }

    await setCloudflareAiGatewayConfig(accountId, gatewayId, resolvedApiKey, params.agentDir);
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: "cloudflare-ai-gateway:default",
      provider: "cloudflare-ai-gateway",
      mode: "api_key",
    });
    nextConfig = applyCloudflareAiGatewayConfig(nextConfig, {
      accountId: accountId || params.opts?.cloudflareAiGatewayAccountId,
      gatewayId: gatewayId || params.opts?.cloudflareAiGatewayGatewayId,
    });
    return { config: nextConfig };
  }

  if (authChoice === "gemini-api-key") {
    await ensureApiKeyFromOptionEnvOrPrompt({
      token: params.opts?.token,
      provider: "google",
      tokenProvider: normalizedTokenProvider,
      expectedProviders: ["google"],
      envLabel: "GEMINI_API_KEY",
      promptMessage: "Enter Gemini API key",
      normalize: normalizeApiKeyInput,
      validate: validateApiKeyInput,
      prompter: params.prompter,
      setCredential: async (apiKey) => setGeminiApiKey(apiKey, params.agentDir),
    });
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: "google:default",
      provider: "google",
      mode: "api_key",
    });
    return { config: nextConfig };
  }

  if (
    authChoice === "zai-api-key" ||
    authChoice === "zai-coding-global" ||
    authChoice === "zai-coding-cn" ||
    authChoice === "zai-global" ||
    authChoice === "zai-cn"
  ) {
    let endpoint = ZAI_AUTH_CHOICE_ENDPOINT[authChoice];

    const apiKey = await ensureApiKeyFromOptionEnvOrPrompt({
      token: params.opts?.token,
      provider: "zai",
      tokenProvider: normalizedTokenProvider,
      expectedProviders: ["zai"],
      envLabel: "ZAI_API_KEY",
      promptMessage: "Enter Z.AI API key",
      normalize: normalizeApiKeyInput,
      validate: validateApiKeyInput,
      prompter: params.prompter,
      setCredential: async (apiKey) => setZaiApiKey(apiKey, params.agentDir),
    });

    // zai-api-key: auto-detect endpoint + choose a working default model.
    let modelIdOverride: string | undefined;
    if (!endpoint) {
      const detected = await detectZaiEndpoint({ apiKey });
      if (detected) {
        endpoint = detected.endpoint;
        modelIdOverride = detected.modelId;
        await params.prompter.note(detected.note, "Z.AI endpoint");
      } else {
        endpoint = await params.prompter.select({
          message: "Select Z.AI endpoint",
          options: [
            {
              value: "coding-global",
              label: "Coding-Plan-Global",
              hint: "GLM Coding Plan Global (api.z.ai)",
            },
            {
              value: "coding-cn",
              label: "Coding-Plan-CN",
              hint: "GLM Coding Plan CN (open.bigmodel.cn)",
            },
            {
              value: "global",
              label: "Global",
              hint: "Z.AI Global (api.z.ai)",
            },
            {
              value: "cn",
              label: "CN",
              hint: "Z.AI CN (open.bigmodel.cn)",
            },
          ],
          initialValue: "global",
        });
      }
    }

    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: "zai:default",
      provider: "zai",
      mode: "api_key",
    });

    nextConfig = applyZaiConfig(nextConfig, {
      endpoint,
      ...(modelIdOverride ? { modelId: modelIdOverride } : {}),
    });

    return { config: nextConfig };
  }

  if (authChoice === "huggingface-api-key") {
    return applyAuthChoiceHuggingface({ ...params, authChoice });
  }

  return null;
}
