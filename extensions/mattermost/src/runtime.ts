import type { PluginRuntime } from "remoteclaw/plugin-sdk/mattermost";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setMattermostRuntime, getRuntime: getMattermostRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Mattermost runtime not initialized");
export { getMattermostRuntime, setMattermostRuntime };
