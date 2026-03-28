export { definePluginEntry } from "remoteclaw/plugin-sdk/core";
export type {
  AnyAgentTool,
  RemoteClawPluginApi,
  RemoteClawPluginToolContext,
  RemoteClawPluginToolFactory,
} from "remoteclaw/plugin-sdk/core";
export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "remoteclaw/plugin-sdk/windows-spawn";
