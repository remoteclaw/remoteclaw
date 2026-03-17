import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/zalouser";

const { setRuntime: setZalouserRuntime, getRuntime: getZalouserRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Zalouser runtime not initialized");
export { getZalouserRuntime, setZalouserRuntime };
