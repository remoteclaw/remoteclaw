import type { RemoteClawConfig } from "../../config/config.js";
import { findNormalizedProviderValue, normalizeProviderId } from "../provider-utils.js";
import type { AuthCredentialReasonCode } from "./credential-state.js";
import { evaluateStoredCredentialEligibility } from "./credential-state.js";
import { dedupeProfileIds, listProfilesForProvider } from "./profiles.js";
import type { AuthProfileStore } from "./types.js";

function normalizeProviderIdForAuth(provider: string): string {
  const normalized = normalizeProviderId(provider);
  if (normalized === "volcengine-plan") {
    return "volcengine";
  }
  if (normalized === "byteplus-plan") {
    return "byteplus";
  }
  return normalized;
}

export type AuthProfileEligibilityReasonCode =
  | AuthCredentialReasonCode
  | "profile_missing"
  | "provider_mismatch"
  | "mode_mismatch";

export type AuthProfileEligibility = {
  eligible: boolean;
  reasonCode: AuthProfileEligibilityReasonCode;
};

export function resolveAuthProfileEligibility(params: {
  cfg?: RemoteClawConfig;
  store: AuthProfileStore;
  provider: string;
  profileId: string;
  now?: number;
}): AuthProfileEligibility {
  const providerAuthKey = normalizeProviderIdForAuth(params.provider);
  const cred = params.store.profiles[params.profileId];
  if (!cred) {
    return { eligible: false, reasonCode: "profile_missing" };
  }
  if (normalizeProviderIdForAuth(cred.provider) !== providerAuthKey) {
    return { eligible: false, reasonCode: "provider_mismatch" };
  }
  const profileConfig = (params.cfg as Record<string, unknown> | undefined)?.auth as
    | { profiles?: Record<string, { provider: string; mode?: string }> }
    | undefined;
  const profileEntry = profileConfig?.profiles?.[params.profileId];
  if (profileEntry) {
    if (normalizeProviderIdForAuth(profileEntry.provider) !== providerAuthKey) {
      return { eligible: false, reasonCode: "provider_mismatch" };
    }
    if (profileEntry.mode !== cred.type) {
      const oauthCompatible = profileEntry.mode === "oauth" && cred.type === "token";
      if (!oauthCompatible) {
        return { eligible: false, reasonCode: "mode_mismatch" };
      }
    }
  }
  const credentialEligibility = evaluateStoredCredentialEligibility({
    credential: cred,
    now: params.now,
  });
  return {
    eligible: credentialEligibility.eligible,
    reasonCode: credentialEligibility.reasonCode,
  };
}

export function resolveAuthProfileOrder(params: {
  cfg?: RemoteClawConfig;
  store: AuthProfileStore;
  provider: string;
  preferredProfile?: string;
}): string[] {
  const { cfg, store, provider, preferredProfile } = params;
  const providerKey = normalizeProviderId(provider);
  const providerAuthKey = normalizeProviderIdForAuth(provider);
  const now = Date.now();

  const storedOrder = findNormalizedProviderValue(store.order, providerKey);
  const cfgAuth = (cfg as Record<string, unknown> | undefined)?.auth as
    | {
        order?: Record<string, string[]>;
        profiles?: Record<string, { provider: string }>;
      }
    | undefined;
  const configuredOrder = findNormalizedProviderValue(cfgAuth?.order, providerKey);
  const explicitOrder = storedOrder ?? configuredOrder;
  const explicitProfiles = cfgAuth?.profiles
    ? Object.entries(cfgAuth.profiles)
        .filter(([, profile]) => normalizeProviderIdForAuth(profile.provider) === providerAuthKey)
        .map(([profileId]) => profileId)
    : [];
  const baseOrder =
    explicitOrder ?? (explicitProfiles.length > 0 ? explicitProfiles : listProfilesForProvider(store, provider));
  if (baseOrder.length === 0) {
    return [];
  }

  const isValidProfile = (profileId: string): boolean =>
    resolveAuthProfileEligibility({
      cfg,
      store,
      provider: providerAuthKey,
      profileId,
      now,
    }).eligible;
  let filtered = baseOrder.filter(isValidProfile);

  const allBaseProfilesMissing = baseOrder.every((profileId) => !store.profiles[profileId]);
  if (filtered.length === 0 && explicitProfiles.length > 0 && allBaseProfilesMissing) {
    const storeProfiles = listProfilesForProvider(store, provider);
    filtered = storeProfiles.filter(isValidProfile);
  }

  const deduped = dedupeProfileIds(filtered);

  if (preferredProfile && deduped.includes(preferredProfile)) {
    return [preferredProfile, ...deduped.filter((e) => e !== preferredProfile)];
  }

  return deduped;
}
