import type { PluginRuntime } from "remoteclaw/plugin-sdk/googlechat";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Google Chat runtime not initialized");
export { getGoogleChatRuntime, setGoogleChatRuntime };
