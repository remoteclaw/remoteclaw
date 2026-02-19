import type { RemoteClawConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: RemoteClawConfig, pluginId: string): RemoteClawConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}
