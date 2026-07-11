import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import { normalizeUniqueTrimmedStringList } from "../shared/string-normalization.js";
import { isRecord } from "../utils.js";

export const MODULE_ATTESTATIONS = {
  resolveCodexNativeWebSearchConfig: "live",
  describeCodexNativeWebSearch: "live",
} as const;

export type CodexNativeSearchMode = "cached" | "live";
export type CodexNativeSearchContextSize = "low" | "medium" | "high";

export type CodexNativeSearchUserLocation = {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
};

export type ResolvedCodexNativeWebSearchConfig = {
  enabled: boolean;
  mode: CodexNativeSearchMode;
  allowedDomains?: string[];
  contextSize?: CodexNativeSearchContextSize;
  userLocation?: CodexNativeSearchUserLocation;
};

function normalizeAllowedDomains(value: unknown): string[] | undefined {
  const deduped = normalizeUniqueTrimmedStringList(value);
  return deduped.length > 0 ? deduped : undefined;
}

function normalizeContextSize(value: unknown): CodexNativeSearchContextSize | undefined {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return undefined;
}

function normalizeMode(value: unknown): CodexNativeSearchMode {
  return value === "live" ? "live" : "cached";
}

function normalizeUserLocation(value: unknown): CodexNativeSearchUserLocation | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const location = {
    country: typeof value.country === "string" ? value.country.trim() || undefined : undefined,
    region: typeof value.region === "string" ? value.region.trim() || undefined : undefined,
    city: typeof value.city === "string" ? value.city.trim() || undefined : undefined,
    timezone: typeof value.timezone === "string" ? value.timezone.trim() || undefined : undefined,
  };
  return location.country || location.region || location.city || location.timezone
    ? location
    : undefined;
}

export function resolveCodexNativeWebSearchConfig(
  config: RemoteClawConfig | undefined,
): ResolvedCodexNativeWebSearchConfig {
  const nativeConfig = config?.tools?.web?.search?.openaiCodex;
  return {
    enabled: nativeConfig?.enabled === true,
    mode: normalizeMode(nativeConfig?.mode),
    allowedDomains: normalizeAllowedDomains(nativeConfig?.allowedDomains),
    contextSize: normalizeContextSize(nativeConfig?.contextSize),
    userLocation: normalizeUserLocation(nativeConfig?.userLocation),
  };
}

export function describeCodexNativeWebSearch(
  config: RemoteClawConfig | undefined,
): string | undefined {
  if (config?.tools?.web?.search?.enabled === false) {
    return undefined;
  }

  const nativeConfig = resolveCodexNativeWebSearchConfig(config);
  if (!nativeConfig.enabled) {
    return undefined;
  }
  return `Codex native search: ${nativeConfig.mode} for Codex-capable models`;
}
