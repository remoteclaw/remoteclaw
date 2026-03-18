// Public ACPX runtime backend helpers.
// Keep this surface narrow and limited to the ACP runtime/backend contract.

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
