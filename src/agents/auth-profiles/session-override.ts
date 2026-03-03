import type { RemoteClawConfig } from "../../config/config.js";
import { updateSessionStore, type SessionEntry } from "../../config/sessions.js";
import { normalizeProviderId } from "../provider-utils.js";
import { listProfilesForProvider } from "./profiles.js";
import { ensureAuthProfileStore } from "./store.js";

function isProfileForProvider(params: {
  provider: string;
  profileId: string;
  store: ReturnType<typeof ensureAuthProfileStore>;
}): boolean {
  const entry = params.store.profiles[params.profileId];
  if (!entry?.provider) {
    return false;
  }
  return normalizeProviderId(entry.provider) === normalizeProviderId(params.provider);
}

export async function clearSessionAuthProfileOverride(params: {
  sessionEntry: SessionEntry;
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
}) {
  const { sessionEntry, sessionStore, sessionKey, storePath } = params;
  delete sessionEntry.authProfileOverride;
  delete sessionEntry.authProfileOverrideSource;
  delete sessionEntry.authProfileOverrideCompactionCount;
  sessionEntry.updatedAt = Date.now();
  sessionStore[sessionKey] = sessionEntry;
  if (storePath) {
    await updateSessionStore(storePath, (store) => {
      store[sessionKey] = sessionEntry;
    });
  }
}

export async function resolveSessionAuthProfileOverride(params: {
  cfg: RemoteClawConfig;
  provider: string;
  agentDir: string;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  isNewSession: boolean;
}): Promise<string | undefined> {
  const { provider, agentDir, sessionEntry, sessionStore, sessionKey, storePath } = params;
  if (!sessionEntry || !sessionStore || !sessionKey) {
    return sessionEntry?.authProfileOverride;
  }

  const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
  const profiles = listProfilesForProvider(store, provider);
  let current = sessionEntry.authProfileOverride?.trim();

  if (current && !store.profiles[current]) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (current && !isProfileForProvider({ provider, profileId: current, store })) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (profiles.length === 0) {
    return undefined;
  }

  // Return existing override or first matching profile.
  const next = current ?? profiles[0];
  if (!next) {
    return current;
  }

  const shouldPersist =
    next !== sessionEntry.authProfileOverride || sessionEntry.authProfileOverrideSource !== "auto";
  if (shouldPersist) {
    sessionEntry.authProfileOverride = next;
    sessionEntry.authProfileOverrideSource = "auto";
    sessionEntry.updatedAt = Date.now();
    sessionStore[sessionKey] = sessionEntry;
    if (storePath) {
      await updateSessionStore(storePath, (store) => {
        store[sessionKey] = sessionEntry;
      });
    }
  }

  return next;
}
