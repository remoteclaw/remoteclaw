// Narrow plugin-sdk surface for the bundled llm-task plugin.
// Keep this list additive and scoped to symbols used under extensions/llm-task.

export { resolvePreferredRemoteClawTmpDir } from "../infra/tmp-remoteclaw-dir.js";
export type { AnyAgentTool, RemoteClawPluginApi } from "../plugins/types.js";
