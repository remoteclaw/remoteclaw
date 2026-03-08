import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveApiKeyForProfile,
} from "../auth/index.js";
import { normalizeSecretInput } from "../utils/normalize-secret-input.js";
import { resolveRequiredHomeDir } from "./home-dir.js";
import type { UsageProviderId } from "./provider-usage.types.js";

export type ProviderAuth = {
  provider: UsageProviderId;
  token: string;
  accountId?: string;
};

function resolveZaiApiKey(): string | undefined {
  const envDirect =
    normalizeSecretInput(process.env.ZAI_API_KEY) || normalizeSecretInput(process.env.Z_AI_API_KEY);
  if (envDirect) {
    return envDirect;
  }

  const store = ensureAuthProfileStore();
  const apiProfile = [
    ...listProfilesForProvider(store, "zai"),
    ...listProfilesForProvider(store, "z-ai"),
  ].find((id) => {
    const t = store.profiles[id]?.type;
    return t === "api_key" || t === "token";
  });
  if (apiProfile) {
    const cred = store.profiles[apiProfile];
    if ((cred?.type === "api_key" || cred?.type === "token") && normalizeSecretInput(cred.key)) {
      return normalizeSecretInput(cred.key);
    }
  }

  try {
    const authPath = path.join(
      resolveRequiredHomeDir(process.env, os.homedir),
      ".pi",
      "agent",
      "auth.json",
    );
    if (!fs.existsSync(authPath)) {
      return undefined;
    }
    const data = JSON.parse(fs.readFileSync(authPath, "utf-8")) as Record<
      string,
      { access?: string }
    >;
    return data["z-ai"]?.access || data.zai?.access;
  } catch {
    return undefined;
  }
}

function resolveMinimaxApiKey(): string | undefined {
  return resolveProviderApiKeyFromConfigAndStore({
    providerId: "minimax",
    envDirect: [process.env.MINIMAX_CODE_PLAN_KEY, process.env.MINIMAX_API_KEY],
  });
}

function resolveXiaomiApiKey(): string | undefined {
  return resolveProviderApiKeyFromConfigAndStore({
    providerId: "xiaomi",
    envDirect: [process.env.XIAOMI_API_KEY],
  });
}

function resolveProviderApiKeyFromConfigAndStore(params: {
  providerId: UsageProviderId;
  envDirect: Array<string | undefined>;
}): string | undefined {
  const envDirect = params.envDirect.map(normalizeSecretInput).find(Boolean);
  if (envDirect) {
    return envDirect;
  }

  const store = ensureAuthProfileStore();
  const cred = listProfilesForProvider(store, params.providerId)
    .map((id) => store.profiles[id])
    .find(
      (profile): profile is { type: "api_key" | "token"; provider: string; key: string } =>
        profile?.type === "api_key" || profile?.type === "token",
    );
  if (!cred) {
    return undefined;
  }
  return normalizeSecretInput(cred.key);
}

async function resolveProfileToken(params: {
  provider: UsageProviderId;
}): Promise<ProviderAuth | null> {
  const store = ensureAuthProfileStore();
  const profiles = listProfilesForProvider(store, params.provider);

  for (const profileId of profiles) {
    try {
      const resolved = await resolveApiKeyForProfile({
        cfg: undefined,
        store,
        profileId,
      });
      if (resolved) {
        return {
          provider: params.provider,
          token: resolved.apiKey,
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function resolveProviderCandidates(): UsageProviderId[] {
  const store = ensureAuthProfileStore();
  const providers = [
    "anthropic",
    "github-copilot",
    "google-gemini-cli",
    "openai-codex",
  ] satisfies UsageProviderId[];
  return providers.filter((provider) => {
    const profiles = listProfilesForProvider(store, provider);
    return profiles.length > 0;
  });
}

export async function resolveProviderAuths(params: {
  providers: UsageProviderId[];
  auth?: ProviderAuth[];
}): Promise<ProviderAuth[]> {
  if (params.auth) {
    return params.auth;
  }

  const candidates = resolveProviderCandidates();
  const auths: ProviderAuth[] = [];

  for (const provider of params.providers) {
    if (provider === "zai") {
      const apiKey = resolveZaiApiKey();
      if (apiKey) {
        auths.push({ provider, token: apiKey });
      }
      continue;
    }
    if (provider === "minimax") {
      const apiKey = resolveMinimaxApiKey();
      if (apiKey) {
        auths.push({ provider, token: apiKey });
      }
      continue;
    }
    if (provider === "xiaomi") {
      const apiKey = resolveXiaomiApiKey();
      if (apiKey) {
        auths.push({ provider, token: apiKey });
      }
      continue;
    }

    if (!candidates.includes(provider)) {
      continue;
    }
    const auth = await resolveProfileToken({
      provider,
    });
    if (auth) {
      auths.push(auth);
    }
  }

  return auths;
}
