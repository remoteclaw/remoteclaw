import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk";
import type { PluginRuntime } from "remoteclaw/plugin-sdk";

const { setRuntime: setZaloRuntime, getRuntime: getZaloRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Zalo runtime not initialized");
export { getZaloRuntime, setZaloRuntime };
