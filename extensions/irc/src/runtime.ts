import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk";
import type { PluginRuntime } from "remoteclaw/plugin-sdk";

const { setRuntime: setIrcRuntime, getRuntime: getIrcRuntime } =
  createPluginRuntimeStore<PluginRuntime>("IRC runtime not initialized");
export { getIrcRuntime, setIrcRuntime };
