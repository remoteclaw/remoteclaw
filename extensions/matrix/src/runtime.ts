import type { PluginRuntime } from "remoteclaw/plugin-sdk/matrix";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setMatrixRuntime, getRuntime: getMatrixRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Matrix runtime not initialized");

export { getMatrixRuntime, setMatrixRuntime };
