/**
 * Runtime store for host-provided RemoteClaw services used by the ClickClack
 * bundled plugin.
 */
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/clickclack";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/clickclack";

const { setRuntime: setClickClackRuntime, getRuntime: getClickClackRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "clickclack",
    errorMessage: "ClickClack runtime not initialized",
  });

export { getClickClackRuntime, setClickClackRuntime };
