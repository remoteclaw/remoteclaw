// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to the bundled diffs surface.

export type { RemoteClawConfig } from "../config/config.js";
export { resolvePreferredRemoteClawTmpDir } from "../infra/tmp-remoteclaw-dir.js";
export type {
  AnyAgentTool,
  RemoteClawPluginApi,
  RemoteClawPluginConfigSchema,
  PluginLogger,
} from "../plugins/types.js";
