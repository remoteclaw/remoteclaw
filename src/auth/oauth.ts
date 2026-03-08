import type { RemoteClawConfig } from "../config/config.js";
import type { AuthProfileStore } from "./types.js";

function isProfileConfigCompatible(params: {
  cfg?: RemoteClawConfig;
  profileId: string;
  provider: string;
}): boolean {
  const profileConfig = params.cfg?.auth?.profiles?.[params.profileId];
  if (profileConfig && profileConfig.provider !== params.provider) {
    return false;
  }
  return true;
}

function buildApiKeyProfileResult(params: { apiKey: string; provider: string; email?: string }) {
  return {
    apiKey: params.apiKey,
    provider: params.provider,
    email: params.email,
  };
}

type ResolveApiKeyForProfileParams = {
  cfg?: RemoteClawConfig;
  store: AuthProfileStore;
  profileId: string;
};

export async function resolveApiKeyForProfile(
  params: ResolveApiKeyForProfileParams,
): Promise<{ apiKey: string; provider: string; email?: string } | null> {
  const { cfg, store, profileId } = params;
  const cred = store.profiles[profileId];
  if (!cred) {
    return null;
  }
  if (
    !isProfileConfigCompatible({
      cfg,
      profileId,
      provider: cred.provider,
    })
  ) {
    return null;
  }

  const key = (cred.type === "token" ? cred.token : cred.key)?.trim();
  if (!key) {
    return null;
  }
  return buildApiKeyProfileResult({ apiKey: key, provider: cred.provider, email: cred.email });
}
