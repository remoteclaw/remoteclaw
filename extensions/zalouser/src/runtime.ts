import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk";
import type { PluginRuntime } from "remoteclaw/plugin-sdk";

const { setRuntime: setZalouserRuntime, getRuntime: getZalouserRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Zalouser runtime not initialized");
export { getZalouserRuntime, setZalouserRuntime };
