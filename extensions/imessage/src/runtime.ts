import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "imessage",
    errorMessage: "iMessage runtime not initialized",
  });
export { getIMessageRuntime, setIMessageRuntime };
