import { resolveAgentWorkspaceDirOrNull, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging.js";
import { loadRemoteClawPlugins } from "../plugins/loader.js";
import { loadPluginManifestRegistry } from "../plugins/manifest-registry.js";
import { getActivePluginRegistry } from "../plugins/runtime.js";
import type { PluginLogger } from "../plugins/types.js";

const log = createSubsystemLogger("plugins");
let pluginRegistryLoaded: "none" | "channels" | "all" = "none";

export type PluginRegistryScope = "channels" | "all";

function resolveChannelPluginIds(params: {
  config: ReturnType<typeof loadConfig>;
  workspaceDir?: string;
  env: NodeJS.ProcessEnv;
}): string[] {
  return loadPluginManifestRegistry({
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
  })
    .plugins.filter((plugin) => plugin.channels.length > 0)
    .map((plugin) => plugin.id);
}

export function ensurePluginRegistryLoaded(options?: { scope?: PluginRegistryScope }): void {
  const scope = options?.scope ?? "all";
  if (pluginRegistryLoaded === "all" || pluginRegistryLoaded === scope) {
    return;
  }
  const active = getActivePluginRegistry();
  // Tests (and callers) can pre-seed a registry (e.g. `test/setup.ts`); avoid
  // doing an expensive load when we already have plugins/channels/tools.
  if (
    active &&
    (active.plugins.length > 0 || active.channels.length > 0 || active.tools.length > 0)
  ) {
    pluginRegistryLoaded = "all";
    return;
  }
  const config = loadConfig();
  const workspaceDir = resolveAgentWorkspaceDirOrNull(config, resolveDefaultAgentId(config));
  const logger: PluginLogger = {
    info: (msg) => log.info(msg),
    warn: (msg) => log.warn(msg),
    error: (msg) => log.error(msg),
    debug: (msg) => log.debug(msg),
  };
  loadRemoteClawPlugins({
    config,
    workspaceDir: workspaceDir ?? undefined,
    logger,
    throwOnLoadError: true,
    ...(scope === "channels"
      ? {
          onlyPluginIds: resolveChannelPluginIds({
            config,
            workspaceDir: workspaceDir ?? undefined,
            env: process.env,
          }),
        }
      : {}),
  });
  pluginRegistryLoaded = scope;
}
