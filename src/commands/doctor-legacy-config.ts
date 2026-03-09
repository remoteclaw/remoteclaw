import type { RemoteClawConfig } from "../config/config.js";

export function normalizeLegacyConfigValues(cfg: RemoteClawConfig): {
  config: RemoteClawConfig;
  changes: string[];
} {
  return { config: cfg, changes: [] };
}
