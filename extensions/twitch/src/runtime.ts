import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/twitch";

const { setRuntime: setTwitchRuntime, getRuntime: getTwitchRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Twitch runtime not initialized");
export { getTwitchRuntime, setTwitchRuntime };
