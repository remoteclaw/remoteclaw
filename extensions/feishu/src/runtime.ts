import type { PluginRuntime } from "remoteclaw/plugin-sdk/feishu";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setFeishuRuntime, getRuntime: getFeishuRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Feishu runtime not initialized");
export { getFeishuRuntime, setFeishuRuntime };
