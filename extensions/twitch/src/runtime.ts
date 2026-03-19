import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk";
import type { PluginRuntime } from "remoteclaw/plugin-sdk";

const { setRuntime: setTwitchRuntime, getRuntime: getTwitchRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Twitch runtime not initialized");
export { getTwitchRuntime, setTwitchRuntime };
