import type { PluginRuntime } from "remoteclaw/plugin-sdk/irc";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setIrcRuntime, getRuntime: getIrcRuntime } =
  createPluginRuntimeStore<PluginRuntime>("IRC runtime not initialized");
export { getIrcRuntime, setIrcRuntime };
