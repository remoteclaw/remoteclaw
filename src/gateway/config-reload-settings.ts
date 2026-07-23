// Gateway reload settings resolver.
// Normalizes reload mode and debounce config for watcher/reload handlers.
import type { GatewayReloadMode } from "../config/types.gateway.js";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";

export type GatewayReloadSettings = {
  mode: GatewayReloadMode;
  debounceMs: number;
};

const DEFAULT_RELOAD_SETTINGS: GatewayReloadSettings = {
  mode: "hybrid",
  debounceMs: 300,
};

/** Resolves gateway reload mode/debounce from config with bounded defaults. */
export function resolveGatewayReloadSettings(cfg: RemoteClawConfig): GatewayReloadSettings {
  const rawMode = cfg.gateway?.reload?.mode;
  const mode =
    rawMode === "off" || rawMode === "restart" || rawMode === "hot" || rawMode === "hybrid"
      ? rawMode
      : DEFAULT_RELOAD_SETTINGS.mode;
  const debounceRaw = cfg.gateway?.reload?.debounceMs;
  const debounceMs =
    typeof debounceRaw === "number" && Number.isFinite(debounceRaw)
      ? Math.max(0, Math.floor(debounceRaw))
      : DEFAULT_RELOAD_SETTINGS.debounceMs;
  return { mode, debounceMs };
}
