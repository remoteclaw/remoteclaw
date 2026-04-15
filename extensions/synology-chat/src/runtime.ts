import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/synology-chat";

const { setRuntime: setSynologyRuntime, getRuntime: getSynologyRuntime } =
  createPluginRuntimeStore<PluginRuntime>(
    "Synology Chat runtime not initialized - plugin not registered",
  );
export { getSynologyRuntime, setSynologyRuntime };
