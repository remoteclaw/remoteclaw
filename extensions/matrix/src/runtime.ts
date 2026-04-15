import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/matrix";

const { setRuntime: setMatrixRuntime, getRuntime: getMatrixRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Matrix runtime not initialized");
export { getMatrixRuntime, setMatrixRuntime };
