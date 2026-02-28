import path from "node:path";
import { type Api, getEnvApiKey, type Model } from "@mariozechner/pi-ai";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { getShellEnvAppliedKeys } from "../infra/shell-env.js";
import {
  normalizeOptionalSecretInput,
  normalizeSecretInput,
} from "../utils/normalize-secret-input.js";
import {
  type AuthProfileStore,
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveApiKeyForProfile,
  resolveAuthStorePathForDisplay,
} from "./auth-profiles.js";
import { normalizeProviderId } from "./model-selection.js";

export { ensureAuthProfileStore } from "./auth-profiles.js";

const AWS_BEARER_ENV = "AWS_BEARER_TOKEN_BEDROCK";
const AWS_ACCESS_KEY_ENV = "AWS_ACCESS_KEY_ID";
const AWS_SECRET_KEY_ENV = "AWS_SECRET_ACCESS_KEY";
const AWS_PROFILE_ENV = "AWS_PROFILE";

export function getCustomProviderApiKey(
  _cfg: OpenClawConfig | undefined,
  _provider: string,
): string | undefined {
  // Models config section has been removed — provider configs are no longer
  // stored in the config file. CLI agents resolve providers directly.
  return undefined;
}

function resolveEnvSourceLabel(params: {
  applied: Set<string>;
  envVars: string[];
  label: string;
}): string {
  const shellApplied = params.envVars.some((envVar) => params.applied.has(envVar));
  const prefix = shellApplied ? "shell env: " : "env: ";
  return `${prefix}${params.label}`;
}

export function resolveAwsSdkEnvVarName(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env[AWS_BEARER_ENV]?.trim()) {
    return AWS_BEARER_ENV;
  }
  if (env[AWS_ACCESS_KEY_ENV]?.trim() && env[AWS_SECRET_KEY_ENV]?.trim()) {
    return AWS_ACCESS_KEY_ENV;
  }
  if (env[AWS_PROFILE_ENV]?.trim()) {
    return AWS_PROFILE_ENV;
  }
  return undefined;
}

function resolveAwsSdkAuthInfo(): { mode: "api-key"; source: string } {
  const applied = new Set(getShellEnvAppliedKeys());
  if (process.env[AWS_BEARER_ENV]?.trim()) {
    return {
      mode: "api-key",
      source: resolveEnvSourceLabel({
        applied,
        envVars: [AWS_BEARER_ENV],
        label: AWS_BEARER_ENV,
      }),
    };
  }
  if (process.env[AWS_ACCESS_KEY_ENV]?.trim() && process.env[AWS_SECRET_KEY_ENV]?.trim()) {
    return {
      mode: "api-key",
      source: resolveEnvSourceLabel({
        applied,
        envVars: [AWS_ACCESS_KEY_ENV, AWS_SECRET_KEY_ENV],
        label: `${AWS_ACCESS_KEY_ENV} + ${AWS_SECRET_KEY_ENV}`,
      }),
    };
  }
  if (process.env[AWS_PROFILE_ENV]?.trim()) {
    return {
      mode: "api-key",
      source: resolveEnvSourceLabel({
        applied,
        envVars: [AWS_PROFILE_ENV],
        label: AWS_PROFILE_ENV,
      }),
    };
  }
  return { mode: "api-key", source: "aws-sdk default chain" };
}

export type ResolvedProviderAuth = {
  apiKey?: string;
  profileId?: string;
  source: string;
  mode: "api-key";
};

export async function resolveApiKeyForProvider(params: {
  provider: string;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  const { provider, cfg, profileId } = params;
  const store = params.store ?? ensureAuthProfileStore(params.agentDir);

  if (profileId) {
    const resolved = await resolveApiKeyForProfile({
      cfg,
      store,
      profileId,
      agentDir: params.agentDir,
    });
    if (!resolved) {
      throw new Error(`No credentials found for profile "${profileId}".`);
    }
    return {
      apiKey: resolved.apiKey,
      profileId,
      source: `profile:${profileId}`,
      mode: "api-key",
    };
  }

  // Check profiles for the provider
  const profiles = listProfilesForProvider(store, provider);
  const preferred = params.preferredProfile;
  const candidates =
    preferred && profiles.includes(preferred)
      ? [preferred, ...profiles.filter((id) => id !== preferred)]
      : profiles;

  for (const candidate of candidates) {
    try {
      const resolved = await resolveApiKeyForProfile({
        cfg,
        store,
        profileId: candidate,
        agentDir: params.agentDir,
      });
      if (resolved) {
        return {
          apiKey: resolved.apiKey,
          profileId: candidate,
          source: `profile:${candidate}`,
          mode: "api-key",
        };
      }
    } catch {}
  }

  const envResolved = resolveEnvApiKey(provider);
  if (envResolved) {
    return {
      apiKey: envResolved.apiKey,
      source: envResolved.source,
      mode: "api-key",
    };
  }

  const normalized = normalizeProviderId(provider);
  if (normalized === "amazon-bedrock") {
    return resolveAwsSdkAuthInfo();
  }

  if (provider === "openai") {
    const hasCodex = listProfilesForProvider(store, "openai-codex").length > 0;
    if (hasCodex) {
      throw new Error(
        'No API key found for provider "openai". You are authenticated with OpenAI Codex OAuth. Use openai-codex/gpt-5.3-codex (OAuth) or set OPENAI_API_KEY to use openai/gpt-5.1-codex.',
      );
    }
  }

  const authStorePath = resolveAuthStorePathForDisplay(params.agentDir);
  const resolvedAgentDir = path.dirname(authStorePath);
  throw new Error(
    [
      `No API key found for provider "${provider}".`,
      `Auth store: ${authStorePath} (agentDir: ${resolvedAgentDir}).`,
      `Configure auth for this agent (${formatCliCommand("remoteclaw agents add <id>")}) or copy auth-profiles.json from the main agentDir.`,
    ].join(" "),
  );
}

export type EnvApiKeyResult = { apiKey: string; source: string };
export type ModelAuthMode = "api-key" | "unknown";

export function resolveEnvApiKey(provider: string): EnvApiKeyResult | null {
  const normalized = normalizeProviderId(provider);
  const applied = new Set(getShellEnvAppliedKeys());
  const pick = (envVar: string): EnvApiKeyResult | null => {
    const value = normalizeOptionalSecretInput(process.env[envVar]);
    if (!value) {
      return null;
    }
    const source = applied.has(envVar) ? `shell env: ${envVar}` : `env: ${envVar}`;
    return { apiKey: value, source };
  };

  if (normalized === "github-copilot") {
    return pick("COPILOT_GITHUB_TOKEN") ?? pick("GH_TOKEN") ?? pick("GITHUB_TOKEN");
  }

  if (normalized === "anthropic") {
    return pick("ANTHROPIC_OAUTH_TOKEN") ?? pick("ANTHROPIC_API_KEY");
  }

  if (normalized === "chutes") {
    return pick("CHUTES_OAUTH_TOKEN") ?? pick("CHUTES_API_KEY");
  }

  if (normalized === "zai") {
    return pick("ZAI_API_KEY") ?? pick("Z_AI_API_KEY");
  }

  if (normalized === "google-vertex") {
    const envKey = getEnvApiKey(normalized);
    if (!envKey) {
      return null;
    }
    return { apiKey: envKey, source: "gcloud adc" };
  }

  if (normalized === "opencode") {
    return pick("OPENCODE_API_KEY") ?? pick("OPENCODE_ZEN_API_KEY");
  }

  if (normalized === "qwen-portal") {
    return pick("QWEN_OAUTH_TOKEN") ?? pick("QWEN_PORTAL_API_KEY");
  }

  if (normalized === "volcengine" || normalized === "volcengine-plan") {
    return pick("VOLCANO_ENGINE_API_KEY");
  }

  if (normalized === "byteplus" || normalized === "byteplus-plan") {
    return pick("BYTEPLUS_API_KEY");
  }
  if (normalized === "minimax-portal") {
    return pick("MINIMAX_OAUTH_TOKEN") ?? pick("MINIMAX_API_KEY");
  }

  if (normalized === "kimi-coding") {
    return pick("KIMI_API_KEY") ?? pick("KIMICODE_API_KEY");
  }

  if (normalized === "huggingface") {
    return pick("HUGGINGFACE_HUB_TOKEN") ?? pick("HF_TOKEN");
  }

  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    google: "GEMINI_API_KEY",
    voyage: "VOYAGE_API_KEY",
    groq: "GROQ_API_KEY",
    deepgram: "DEEPGRAM_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    litellm: "LITELLM_API_KEY",
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
    "cloudflare-ai-gateway": "CLOUDFLARE_AI_GATEWAY_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
    minimax: "MINIMAX_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    xiaomi: "XIAOMI_API_KEY",
    synthetic: "SYNTHETIC_API_KEY",
    venice: "VENICE_API_KEY",
    mistral: "MISTRAL_API_KEY",
    opencode: "OPENCODE_API_KEY",
    together: "TOGETHER_API_KEY",
    qianfan: "QIANFAN_API_KEY",
    ollama: "OLLAMA_API_KEY",
    vllm: "VLLM_API_KEY",
    kilocode: "KILOCODE_API_KEY",
  };
  const envVar = envMap[normalized];
  if (!envVar) {
    return null;
  }
  return pick(envVar);
}

export function resolveModelAuthMode(
  provider?: string,
  cfg?: OpenClawConfig,
  store?: AuthProfileStore,
): ModelAuthMode | undefined {
  const resolved = provider?.trim();
  if (!resolved) {
    return undefined;
  }

  const authStore = store ?? ensureAuthProfileStore();
  const profiles = listProfilesForProvider(authStore, resolved);
  if (profiles.length > 0) {
    return "api-key";
  }

  if (normalizeProviderId(resolved) === "amazon-bedrock") {
    return "api-key";
  }

  const envKey = resolveEnvApiKey(resolved);
  if (envKey?.apiKey) {
    return "api-key";
  }

  if (getCustomProviderApiKey(cfg, resolved)) {
    return "api-key";
  }

  return "unknown";
}

export async function getApiKeyForModel(params: {
  model: Model<Api>;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  return resolveApiKeyForProvider({
    provider: params.model.provider,
    cfg: params.cfg,
    profileId: params.profileId,
    preferredProfile: params.preferredProfile,
    store: params.store,
    agentDir: params.agentDir,
  });
}

export function requireApiKey(auth: ResolvedProviderAuth, provider: string): string {
  const key = normalizeSecretInput(auth.apiKey);
  if (key) {
    return key;
  }
  throw new Error(`No API key resolved for provider "${provider}" (auth mode: ${auth.mode}).`);
}
