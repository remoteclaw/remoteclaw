// Narrow plugin-sdk surface for the bundled acpx plugin.
// Keep this list additive and scoped to symbols used under extensions/acpx.

export type {
  RemoteClawPluginApi,
  RemoteClawPluginConfigSchema,
  RemoteClawPluginService,
  RemoteClawPluginServiceContext,
  PluginLogger,
} from "../plugins/types.js";
export type {
  WindowsSpawnProgram,
  WindowsSpawnProgramCandidate,
  WindowsSpawnResolution,
} from "./windows-spawn.js";
export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "./windows-spawn.js";
export {
  listKnownProviderAuthEnvVarNames,
  omitEnvKeysCaseInsensitive,
} from "../secrets/provider-env-vars.js";
