import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/signal";

const { setRuntime: setSignalRuntime, getRuntime: getSignalRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Signal runtime not initialized");
export { getSignalRuntime, setSignalRuntime };
