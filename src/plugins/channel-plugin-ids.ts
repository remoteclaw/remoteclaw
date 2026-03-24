import type { RemoteClawConfig } from "../config/config.js";

/**
 * Resolve channel plugin IDs that should defer their full load until after
 * the gateway starts listening.
 *
 * Fork stub — upstream uses manifest-registry analysis; this returns an empty
 * list since the fork has not adopted setup-runtime channel plugins.
 */
export function resolveConfiguredDeferredChannelPluginIds(_params: {
  config: RemoteClawConfig;
  workspaceDir: string;
  env: NodeJS.ProcessEnv;
}): string[] {
  return [];
}
