import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/msteams";

const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } = createPluginRuntimeStore<PluginRuntime>(
  "MSTeams runtime not initialized",
);
export { getMSTeamsRuntime, setMSTeamsRuntime };
