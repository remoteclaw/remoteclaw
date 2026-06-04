import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setMattermostRuntime, getRuntime: getMattermostRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "mattermost",
    errorMessage: "Mattermost runtime not initialized",
  });
export { getMattermostRuntime, setMattermostRuntime };
