import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/zalo";

const { setRuntime: setZaloRuntime, getRuntime: getZaloRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Zalo runtime not initialized");
export { getZaloRuntime, setZaloRuntime };
