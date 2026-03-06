import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { loadRemoteClawPlugins } from "./loader.js";
import { createPluginLoaderLogger } from "./logger.js";
import type { PluginRegistry } from "./registry.js";

export type PluginStatusReport = PluginRegistry & {
  workspaceDir?: string;
};

const log = createSubsystemLogger("plugins");

export function buildPluginStatusReport(params?: {
  config?: ReturnType<typeof loadConfig>;
  workspaceDir?: string;
}): PluginStatusReport {
  const config = params?.config ?? loadConfig();
  const workspaceDir = params?.workspaceDir
    ? params.workspaceDir
    : resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));

  const registry = loadRemoteClawPlugins({
    config,
    workspaceDir,
    logger: createPluginLoaderLogger(log),
  });

  return {
    workspaceDir,
    ...registry,
  };
}
