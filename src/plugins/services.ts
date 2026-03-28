import type { RemoteClawConfig } from "../config/config.js";
import { STATE_DIR } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { PluginRegistry } from "./registry.js";
import type { RemoteClawPluginServiceContext, PluginLogger } from "./types.js";

const log = createSubsystemLogger("plugins");
const pluginCheckpointLogsEnabled = process.env.OPENCLAW_PLUGIN_CHECKPOINTS === "1";

function createPluginLogger(): PluginLogger {
  return {
    info: (msg) => log.info(msg),
    warn: (msg) => log.warn(msg),
    error: (msg) => log.error(msg),
    debug: (msg) => log.debug(msg),
  };
}

function createServiceContext(params: {
  config: RemoteClawConfig;
  workspaceDir?: string;
}): RemoteClawPluginServiceContext {
  return {
    config: params.config,
    workspaceDir: params.workspaceDir,
    stateDir: STATE_DIR,
    logger: createPluginLogger(),
  };
}

export type PluginServicesHandle = {
  stop: () => Promise<void>;
};

export async function startPluginServices(params: {
  registry: PluginRegistry;
  config: RemoteClawConfig;
  workspaceDir?: string;
}): Promise<PluginServicesHandle> {
  const running: Array<{
    id: string;
    stop?: () => void | Promise<void>;
  }> = [];
  const serviceContext = createServiceContext({
    config: params.config,
    workspaceDir: params.workspaceDir,
  });

  for (const entry of params.registry.services) {
    const service = entry.service;
    const typedHookCountBefore = params.registry.typedHooks.length;
    try {
      await service.start(serviceContext);
      if (pluginCheckpointLogsEnabled) {
        const newTypedHooks = params.registry.typedHooks
          .slice(typedHookCountBefore)
          .filter((hook) => hook.pluginId === entry.pluginId)
          .map((hook) => hook.hookName);
        log.warn(
          `[plugins][checkpoints] service started (${service.id}, plugin=${entry.pluginId}) typedHooksAdded=${newTypedHooks.length}${newTypedHooks.length > 0 ? ` hooks=${newTypedHooks.join(",")}` : ""}`,
        );
      }
      running.push({
        id: service.id,
        stop: service.stop ? () => service.stop?.(serviceContext) : undefined,
      });
    } catch (err) {
      log.error(`plugin service failed (${service.id}): ${String(err)}`);
    }
  }

  return {
    stop: async () => {
      for (const entry of running.toReversed()) {
        if (!entry.stop) {
          continue;
        }
        try {
          await entry.stop();
        } catch (err) {
          log.warn(`plugin service stop failed (${entry.id}): ${String(err)}`);
        }
      }
    },
  };
}
