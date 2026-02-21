import path from "node:path";
import { formatCliCommand } from "../cli/command-format.js";
import type { RemoteClawConfig } from "../config/config.js";
import { getShellEnvAppliedKeys } from "../infra/shell-env.js";
import type { Model } from "../types/pi-ai.js";
import { normalizeSecretInput } from "../utils/normalize-secret-input.js";
import {
  type AuthProfileStore,
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveApiKeyForProfile,
  resolveAuthProfileOrder,
  resolveAuthStorePathForDisplay,
} from "./auth-profiles.js";
import { normalizeProviderId } from "./cli-routing.js";

export { ensureAuthProfileStore, resolveAuthProfileOrder } from "./auth-profiles.js";

const AWS_BEARER_ENV = "AWS_BEARER_TOKEN_BEDROCK";
const AWS_ACCESS_KEY_ENV = "AWS_ACCESS_KEY_ID";
const AWS_SECRET_KEY_ENV = "AWS_SECRET_ACCESS_KEY";
const AWS_PROFILE_ENV = "AWS_PROFILE";

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

function resolveAwsSdkAuthInfo(): { mode: "aws-sdk"; source: string } {
  const applied = new Set(getShellEnvAppliedKeys());
  const resolveEnvSourceLabel = (envVars: string[], label: string): string => {
    const shellApplied = envVars.some((envVar) => applied.has(envVar));
    const prefix = shellApplied ? "shell env: " : "env: ";
    return `${prefix}${label}`;
  };

  if (process.env[AWS_BEARER_ENV]?.trim()) {
    return {
      mode: "aws-sdk",
      source: resolveEnvSourceLabel([AWS_BEARER_ENV], AWS_BEARER_ENV),
    };
  }
  if (process.env[AWS_ACCESS_KEY_ENV]?.trim() && process.env[AWS_SECRET_KEY_ENV]?.trim()) {
    return {
      mode: "aws-sdk",
      source: resolveEnvSourceLabel(
        [AWS_ACCESS_KEY_ENV, AWS_SECRET_KEY_ENV],
        `${AWS_ACCESS_KEY_ENV} + ${AWS_SECRET_KEY_ENV}`,
      ),
    };
  }
  if (process.env[AWS_PROFILE_ENV]?.trim()) {
    return {
      mode: "aws-sdk",
      source: resolveEnvSourceLabel([AWS_PROFILE_ENV], AWS_PROFILE_ENV),
    };
  }
  return { mode: "aws-sdk", source: "aws-sdk default chain" };
}

export type ResolvedProviderAuth = {
  apiKey?: string;
  profileId?: string;
  source: string;
  mode: "api-key" | "token" | "aws-sdk";
};

export async function resolveApiKeyForProvider(params: {
  provider: string;
  cfg?: RemoteClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  const { provider, cfg, profileId, preferredProfile } = params;
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
    const mode = store.profiles[profileId]?.type;
    return {
      apiKey: resolved.apiKey,
      profileId,
      source: `profile:${profileId}`,
      mode: mode === "token" ? "token" : "api-key",
    };
  }

  const order = resolveAuthProfileOrder({
    cfg,
    store,
    provider,
    preferredProfile,
  });
  for (const candidate of order) {
    try {
      const resolved = await resolveApiKeyForProfile({
        cfg,
        store,
        profileId: candidate,
        agentDir: params.agentDir,
      });
      if (resolved) {
        const mode = store.profiles[candidate]?.type;
        return {
          apiKey: resolved.apiKey,
          profileId: candidate,
          source: `profile:${candidate}`,
          mode: mode === "token" ? "token" : "api-key",
        };
      }
    } catch {}
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

export type ModelAuthMode = "api-key" | "token" | "mixed" | "aws-sdk" | "unknown";

export function resolveModelAuthMode(
  provider?: string,
  cfg?: RemoteClawConfig,
  store?: AuthProfileStore,
): ModelAuthMode | undefined {
  const resolved = provider?.trim();
  if (!resolved) {
    return undefined;
  }

  const authStore = store ?? ensureAuthProfileStore();
  const profiles = listProfilesForProvider(authStore, resolved);
  if (profiles.length > 0) {
    const modes = new Set(
      profiles
        .map((id) => authStore.profiles[id]?.type)
        .filter((mode): mode is "api_key" | "token" => Boolean(mode)),
    );
    const distinct = ["token", "api_key"].filter((k) => modes.has(k as "token" | "api_key"));
    if (distinct.length >= 2) {
      return "mixed";
    }
    if (modes.has("token")) {
      return "token";
    }
    if (modes.has("api_key")) {
      return "api-key";
    }
  }

  if (normalizeProviderId(resolved) === "amazon-bedrock") {
    return "aws-sdk";
  }

  return "unknown";
}

export async function getApiKeyForModel(params: {
  model: Model;
  cfg?: RemoteClawConfig;
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
