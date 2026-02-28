import type { OpenClawConfig } from "../config/config.js";
import {
  type AuthProfileCredential,
  type AuthProfileStore,
  resolveAuthProfileDisplayLabel,
} from "./auth-profiles.js";

export type AuthProfileSource = "store";

export type AuthProfileHealthStatus = "ok" | "missing" | "static";

export type AuthProfileHealth = {
  profileId: string;
  provider: string;
  type: "api_key";
  status: AuthProfileHealthStatus;
  source: AuthProfileSource;
  label: string;
};

export type AuthProviderHealthStatus = "ok" | "missing" | "static";

export type AuthProviderHealth = {
  provider: string;
  status: AuthProviderHealthStatus;
  profiles: AuthProfileHealth[];
};

export type AuthHealthSummary = {
  now: number;
  warnAfterMs: number;
  profiles: AuthProfileHealth[];
  providers: AuthProviderHealth[];
};

export const DEFAULT_OAUTH_WARN_MS = 24 * 60 * 60 * 1000;

export function resolveAuthProfileSource(_profileId: string): AuthProfileSource {
  return "store";
}

export function formatRemainingShort(
  remainingMs?: number,
  opts?: {
    underMinuteLabel?: string;
  },
): string {
  if (remainingMs === undefined || Number.isNaN(remainingMs)) {
    return "unknown";
  }
  if (remainingMs <= 0) {
    return "0m";
  }
  const roundedMinutes = Math.round(remainingMs / 60_000);
  if (roundedMinutes < 1) {
    return opts?.underMinuteLabel ?? "1m";
  }
  const minutes = roundedMinutes;
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function buildProfileHealth(params: {
  profileId: string;
  credential: AuthProfileCredential;
  store: AuthProfileStore;
  cfg?: OpenClawConfig;
}): AuthProfileHealth {
  const { profileId, credential, store, cfg } = params;
  const label = resolveAuthProfileDisplayLabel({ cfg, store, profileId });
  const source = resolveAuthProfileSource(profileId);

  return {
    profileId,
    provider: credential.provider,
    type: "api_key",
    status: "static",
    source,
    label,
  };
}

export function buildAuthHealthSummary(params: {
  store: AuthProfileStore;
  cfg?: OpenClawConfig;
  warnAfterMs?: number;
  providers?: string[];
}): AuthHealthSummary {
  const now = Date.now();
  const warnAfterMs = params.warnAfterMs ?? DEFAULT_OAUTH_WARN_MS;
  const providerFilter = params.providers
    ? new Set(params.providers.map((p) => p.trim()).filter(Boolean))
    : null;

  const profiles = Object.entries(params.store.profiles)
    .filter(([_, cred]) => (providerFilter ? providerFilter.has(cred.provider) : true))
    .map(([profileId, credential]) =>
      buildProfileHealth({
        profileId,
        credential,
        store: params.store,
        cfg: params.cfg,
      }),
    )
    .toSorted((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider);
      }
      return a.profileId.localeCompare(b.profileId);
    });

  const providersMap = new Map<string, AuthProviderHealth>();
  for (const profile of profiles) {
    const existing = providersMap.get(profile.provider);
    if (!existing) {
      providersMap.set(profile.provider, {
        provider: profile.provider,
        status: "missing",
        profiles: [profile],
      });
    } else {
      existing.profiles.push(profile);
    }
  }

  if (providerFilter) {
    for (const provider of providerFilter) {
      if (!providersMap.has(provider)) {
        providersMap.set(provider, {
          provider,
          status: "missing",
          profiles: [],
        });
      }
    }
  }

  for (const provider of providersMap.values()) {
    if (provider.profiles.length === 0) {
      provider.status = "missing";
      continue;
    }
    provider.status = "static";
  }

  const providers = Array.from(providersMap.values()).toSorted((a, b) =>
    a.provider.localeCompare(b.provider),
  );

  return { now, warnAfterMs, profiles, providers };
}
