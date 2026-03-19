import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk";
import type { PluginRuntime } from "remoteclaw/plugin-sdk";

const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Google Chat runtime not initialized");
export { getGoogleChatRuntime, setGoogleChatRuntime };
