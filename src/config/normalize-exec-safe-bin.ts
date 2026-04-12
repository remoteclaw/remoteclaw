import type { RemoteClawConfig } from "./types.js";

/**
 * Normalize exec safe-bin profiles and trusted dirs in-place:
 *  - Profile keys are lowercased and trimmed.
 *  - Flag arrays are trimmed and empty strings are removed.
 *  - Trusted dir arrays are trimmed, empty strings removed, and deduplicated.
 */
export function normalizeExecSafeBinProfilesInConfig(cfg: RemoteClawConfig): void {
  normalizeExecBlock(cfg.tools?.exec);
  if (cfg.agents?.list) {
    for (const entry of cfg.agents.list) {
      normalizeExecBlock(entry?.tools?.exec);
    }
  }
}

function normalizeExecBlock(exec: Record<string, unknown> | undefined): void {
  if (!exec || typeof exec !== "object") {
    return;
  }
  const profiles = exec.safeBinProfiles;
  if (profiles && typeof profiles === "object" && !Array.isArray(profiles)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(profiles as Record<string, unknown>)) {
      const nk = key.trim().toLowerCase();
      if (!nk) {
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const profile = value as Record<string, unknown>;
        for (const flagKey of ["allowedValueFlags", "deniedFlags"]) {
          const arr = profile[flagKey];
          if (Array.isArray(arr)) {
            profile[flagKey] = dedupeStringArray(arr);
          }
        }
      }
      normalized[nk] = value;
    }
    exec.safeBinProfiles = normalized;
  }
  const dirs = exec.safeBinTrustedDirs;
  if (Array.isArray(dirs)) {
    exec.safeBinTrustedDirs = dedupeStringArray(dirs);
  }
}

function dedupeStringArray(arr: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
