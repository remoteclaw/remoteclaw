import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/slack";

const { setRuntime: setSlackRuntime, getRuntime: getSlackRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Slack runtime not initialized");
export { getSlackRuntime, setSlackRuntime };
