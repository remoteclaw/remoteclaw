import { normalizeProviderId } from "../agents/provider-utils.js";
import { normalizeSecretInput } from "../utils/normalize-secret-input.js";
import {
  ensureAuthProfileStore,
  saveAuthProfileStore,
  updateAuthProfileStoreWithLock,
} from "./store.js";
import type { AuthProfileCredential, AuthProfileStore } from "./types.js";

export function dedupeProfileIds(profileIds: string[]): string[] {
  return [...new Set(profileIds)];
}

export function upsertAuthProfile(params: {
  profileId: string;
  credential: AuthProfileCredential;
}): void {
  const credential =
    params.credential.type === "token"
      ? { ...params.credential, token: normalizeSecretInput(params.credential.token) ?? "" }
      : {
          ...params.credential,
          ...(typeof params.credential.key === "string"
            ? { key: normalizeSecretInput(params.credential.key) }
            : {}),
        };
  const store = ensureAuthProfileStore();
  store.profiles[params.profileId] = credential;
  saveAuthProfileStore(store);
}

export async function upsertAuthProfileWithLock(params: {
  profileId: string;
  credential: AuthProfileCredential;
}): Promise<AuthProfileStore | null> {
  return await updateAuthProfileStoreWithLock({
    updater: (store) => {
      store.profiles[params.profileId] = params.credential;
      return true;
    },
  });
}

export function listProfilesForProvider(store: AuthProfileStore, provider: string): string[] {
  const providerKey = normalizeProviderId(provider);
  return Object.entries(store.profiles)
    .filter(([, cred]) => normalizeProviderId(cred.provider) === providerKey)
    .map(([id]) => id);
}
