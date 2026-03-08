import { upsertAuthProfile } from "../auth/index.js";
import { KILOCODE_DEFAULT_MODEL_REF } from "../providers/kilocode-shared.js";
import type { OAuthCredentials } from "../types/agent-types.js";
export { MISTRAL_DEFAULT_MODEL_REF, XAI_DEFAULT_MODEL_REF } from "./onboard-auth.models.js";
export { KILOCODE_DEFAULT_MODEL_REF };

export async function writeOAuthCredentials(
  provider: string,
  creds: OAuthCredentials,
): Promise<string> {
  const email =
    typeof creds.email === "string" && creds.email.trim() ? creds.email.trim() : "default";
  const profileId = `${provider}:${email}`;

  const credEmail = email !== "default" ? email : undefined;
  const credential = {
    type: "token" as const,
    provider,
    token: creds.access,
    ...(credEmail ? { email: credEmail } : {}),
  };

  upsertAuthProfile({
    profileId,
    credential,
  });

  return profileId;
}

export async function setAnthropicApiKey(key: string) {
  upsertAuthProfile({
    profileId: "anthropic:default",
    credential: {
      type: "api_key",
      provider: "anthropic",
      key,
    },
  });
}

export async function setGeminiApiKey(key: string) {
  upsertAuthProfile({
    profileId: "google:default",
    credential: {
      type: "api_key",
      provider: "google",
      key,
    },
  });
}

export async function setMinimaxApiKey(key: string, profileId: string = "minimax:default") {
  const provider = profileId.split(":")[0] ?? "minimax";
  upsertAuthProfile({
    profileId,
    credential: {
      type: "api_key",
      provider,
      key,
    },
  });
}

export async function setMoonshotApiKey(key: string) {
  upsertAuthProfile({
    profileId: "moonshot:default",
    credential: {
      type: "api_key",
      provider: "moonshot",
      key,
    },
  });
}

export async function setKimiCodingApiKey(key: string) {
  upsertAuthProfile({
    profileId: "kimi-coding:default",
    credential: {
      type: "api_key",
      provider: "kimi-coding",
      key,
    },
  });
}

export async function setSyntheticApiKey(key: string) {
  upsertAuthProfile({
    profileId: "synthetic:default",
    credential: {
      type: "api_key",
      provider: "synthetic",
      key,
    },
  });
}

export async function setVeniceApiKey(key: string) {
  upsertAuthProfile({
    profileId: "venice:default",
    credential: {
      type: "api_key",
      provider: "venice",
      key,
    },
  });
}

export const ZAI_DEFAULT_MODEL_REF = "zai/glm-5";
export const XIAOMI_DEFAULT_MODEL_REF = "xiaomi/mimo-v2-flash";
export const OPENROUTER_DEFAULT_MODEL_REF = "openrouter/auto";
export const HUGGINGFACE_DEFAULT_MODEL_REF = "huggingface/deepseek-ai/DeepSeek-R1";
export const TOGETHER_DEFAULT_MODEL_REF = "together/moonshotai/Kimi-K2.5";
export const LITELLM_DEFAULT_MODEL_REF = "litellm/claude-opus-4-6";
export const VERCEL_AI_GATEWAY_DEFAULT_MODEL_REF = "vercel-ai-gateway/anthropic/claude-opus-4.6";

export async function setZaiApiKey(key: string) {
  upsertAuthProfile({
    profileId: "zai:default",
    credential: {
      type: "api_key",
      provider: "zai",
      key,
    },
  });
}

export async function setXiaomiApiKey(key: string) {
  upsertAuthProfile({
    profileId: "xiaomi:default",
    credential: {
      type: "api_key",
      provider: "xiaomi",
      key,
    },
  });
}

export async function setOpenrouterApiKey(key: string) {
  // Never persist the literal "undefined" (e.g. when prompt returns undefined and caller used String(key)).
  const safeKey = key === "undefined" ? "" : key;
  upsertAuthProfile({
    profileId: "openrouter:default",
    credential: {
      type: "api_key",
      provider: "openrouter",
      key: safeKey,
    },
  });
}

export async function setCloudflareAiGatewayConfig(
  accountId: string,
  gatewayId: string,
  apiKey: string,
) {
  const normalizedAccountId = accountId.trim();
  const normalizedGatewayId = gatewayId.trim();
  const normalizedKey = apiKey.trim();
  upsertAuthProfile({
    profileId: "cloudflare-ai-gateway:default",
    credential: {
      type: "api_key",
      provider: "cloudflare-ai-gateway",
      key: normalizedKey,
      metadata: {
        accountId: normalizedAccountId,
        gatewayId: normalizedGatewayId,
      },
    },
  });
}

export async function setLitellmApiKey(key: string) {
  upsertAuthProfile({
    profileId: "litellm:default",
    credential: {
      type: "api_key",
      provider: "litellm",
      key,
    },
  });
}

export async function setVercelAiGatewayApiKey(key: string) {
  upsertAuthProfile({
    profileId: "vercel-ai-gateway:default",
    credential: {
      type: "api_key",
      provider: "vercel-ai-gateway",
      key,
    },
  });
}

export async function setOpencodeZenApiKey(key: string) {
  upsertAuthProfile({
    profileId: "opencode:default",
    credential: {
      type: "api_key",
      provider: "opencode",
      key,
    },
  });
}

export async function setTogetherApiKey(key: string) {
  upsertAuthProfile({
    profileId: "together:default",
    credential: {
      type: "api_key",
      provider: "together",
      key,
    },
  });
}

export async function setHuggingfaceApiKey(key: string) {
  upsertAuthProfile({
    profileId: "huggingface:default",
    credential: {
      type: "api_key",
      provider: "huggingface",
      key,
    },
  });
}

export function setQianfanApiKey(key: string) {
  upsertAuthProfile({
    profileId: "qianfan:default",
    credential: {
      type: "api_key",
      provider: "qianfan",
      key,
    },
  });
}

export function setXaiApiKey(key: string) {
  upsertAuthProfile({
    profileId: "xai:default",
    credential: {
      type: "api_key",
      provider: "xai",
      key,
    },
  });
}

export async function setMistralApiKey(key: string) {
  upsertAuthProfile({
    profileId: "mistral:default",
    credential: {
      type: "api_key",
      provider: "mistral",
      key,
    },
  });
}

export async function setKilocodeApiKey(key: string) {
  upsertAuthProfile({
    profileId: "kilocode:default",
    credential: {
      type: "api_key",
      provider: "kilocode",
      key,
    },
  });
}
