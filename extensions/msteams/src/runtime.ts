import type { PluginRuntime } from "remoteclaw/plugin-sdk/msteams";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } =
  createPluginRuntimeStore<PluginRuntime>("MSTeams runtime not initialized");
export { getMSTeamsRuntime, setMSTeamsRuntime };
