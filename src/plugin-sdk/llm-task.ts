// Narrow plugin-sdk surface for the bundled llm-task plugin.
// Keep this list additive and scoped to the bundled LLM task surface.

export { resolvePreferredRemoteClawTmpDir } from "../infra/tmp-remoteclaw-dir.js";
export type { AnyAgentTool, RemoteClawPluginApi } from "../plugins/types.js";
