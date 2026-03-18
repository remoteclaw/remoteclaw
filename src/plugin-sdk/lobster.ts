// Public Lobster plugin helpers.
// Keep this surface narrow and limited to the Lobster workflow/tool contract.

export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "./windows-spawn.js";
export type {
  AnyAgentTool,
  RemoteClawPluginApi,
  RemoteClawPluginToolContext,
  RemoteClawPluginToolFactory,
} from "../plugins/types.js";
