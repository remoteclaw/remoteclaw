import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import { normalizeProviderId } from "../provider-utils.js";
import { ensureAuthProfileStore, saveAuthProfileStore } from "./store.js";
import type { AuthProfileCredential, AuthProfileStore } from "./types.js";

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

export function dedupeProfileIds(profileIds: string[]): string[] {
  return [...new Set(profileIds)];
}

export async function setAuthProfileOrder(params: {
  agentDir?: string;
  provider: string;
  order?: string[] | null;
}): Promise<AuthProfileStore | null> {
  const providerKey = normalizeProviderId(params.provider);
  const sanitized =
    params.order && Array.isArray(params.order)
      ? params.order.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
      : [];
  const deduped = dedupeProfileIds(sanitized);

  const store = ensureAuthProfileStore(params.agentDir);
  store.order = store.order ?? {};
  if (deduped.length === 0) {
    if (!store.order[providerKey]) {
      return store;
    }
    delete store.order[providerKey];
    if (Object.keys(store.order).length === 0) {
      store.order = undefined;
    }
  } else {
    store.order[providerKey] = deduped;
  }
  saveAuthProfileStore(store, params.agentDir);
  return store;
}

export function upsertAuthProfile(params: {
  profileId: string;
  credential: AuthProfileCredential;
  agentDir?: string;
}): void {
  const credential =
    params.credential.type === "api_key"
      ? {
          ...params.credential,
          ...(typeof params.credential.key === "string" ? { key: normalizeSecretInput(params.credential.key) } : {}),
        }
      : params.credential.type === "token"
        ? { ...params.credential, token: normalizeSecretInput(params.credential.token) }
        : params.credential;
  const store = ensureAuthProfileStore(params.agentDir);
  store.profiles[params.profileId] = credential;
  saveAuthProfileStore(store, params.agentDir);
}

export async function upsertAuthProfileWithLock(params: {
  profileId: string;
  credential: AuthProfileCredential;
  agentDir?: string;
}): Promise<void> {
  upsertAuthProfile(params);
}

export function listProfilesForProvider(store: AuthProfileStore, provider: string): string[] {
  const providerKey = normalizeProviderIdForAuth(provider);
  return Object.entries(store.profiles)
    .filter(([, cred]) => normalizeProviderIdForAuth(cred.provider) === providerKey)
    .map(([id]) => id);
}

export async function markAuthProfileGood(params: {
  store: AuthProfileStore;
  provider: string;
  profileId: string;
  agentDir?: string;
}): Promise<void> {
  const { store, provider, profileId, agentDir } = params;
  const profile = store.profiles[profileId];
  if (!profile || profile.provider !== provider) {
    return;
  }
  store.lastGood = { ...store.lastGood, [provider]: profileId };
  saveAuthProfileStore(store, agentDir);
}
