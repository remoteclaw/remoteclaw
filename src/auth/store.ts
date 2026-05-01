import { withFileLock } from "../infra/file-lock.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { AUTH_STORE_LOCK_OPTIONS, AUTH_STORE_VERSION } from "./constants.js";
import { ensureAuthStoreFile, resolveAuthStorePath } from "./paths.js";
import type { AuthProfileCredential, AuthProfileStore, ProfileUsageStats } from "./types.js";

export async function updateAuthProfileStoreWithLock(params: {
  updater: (store: AuthProfileStore) => boolean;
}): Promise<AuthProfileStore | null> {
  const authPath = resolveAuthStorePath();
  ensureAuthStoreFile(authPath);

  try {
    return await withFileLock(authPath, AUTH_STORE_LOCK_OPTIONS, async () => {
      const store = ensureAuthProfileStore();
      const shouldSave = params.updater(store);
      if (shouldSave) {
        saveAuthProfileStore(store);
      }
      return store;
    });
  } catch {
    return null;
  }
}

function coerceAuthStore(raw: unknown): AuthProfileStore | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!record.profiles || typeof record.profiles !== "object") {
    return null;
  }
  const profiles = record.profiles as Record<string, unknown>;
  const normalized: Record<string, AuthProfileCredential> = {};
  for (const [key, value] of Object.entries(profiles)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const typed = value as Record<string, unknown>;
    const provider = typeof typed.provider === "string" ? typed.provider : "";
    if (!provider) {
      continue;
    }
    const type = typed.type === "token" ? "token" : "api_key";
    normalized[key] = {
      ...typed,
      type,
      provider,
    } as AuthProfileCredential;
  }
  const order =
    record.order && typeof record.order === "object"
      ? Object.entries(record.order as Record<string, unknown>).reduce(
          (acc, [provider, value]) => {
            if (!Array.isArray(value)) {
              return acc;
            }
            const list = value
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean);
            if (list.length === 0) {
              return acc;
            }
            acc[provider] = list;
            return acc;
          },
          {} as Record<string, string[]>,
        )
      : undefined;

  return {
    version: Number(record.version ?? AUTH_STORE_VERSION),
    profiles: normalized,
    order,
    lastGood:
      record.lastGood && typeof record.lastGood === "object"
        ? (record.lastGood as Record<string, string>)
        : undefined,
    usageStats:
      record.usageStats && typeof record.usageStats === "object"
        ? (record.usageStats as Record<string, ProfileUsageStats>)
        : undefined,
  };
}

export function loadAuthProfileStore(): AuthProfileStore {
  const authPath = resolveAuthStorePath();
  const raw = loadJsonFile(authPath);
  const asStore = coerceAuthStore(raw);
  if (asStore) {
    return asStore;
  }

  return { version: AUTH_STORE_VERSION, profiles: {} };
}

export function ensureAuthProfileStore(): AuthProfileStore {
  return loadAuthProfileStore();
}

export function saveAuthProfileStore(store: AuthProfileStore): void {
  const authPath = resolveAuthStorePath();
  const payload = {
    version: AUTH_STORE_VERSION,
    profiles: store.profiles,
    order: store.order ?? undefined,
    lastGood: store.lastGood ?? undefined,
    usageStats: store.usageStats ?? undefined,
  } satisfies AuthProfileStore;
  saveJsonFile(authPath, payload);
}
