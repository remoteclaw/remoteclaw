import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/feishu";

const { setRuntime: setFeishuRuntime, getRuntime: getFeishuRuntime } = createPluginRuntimeStore<PluginRuntime>(
  "Feishu runtime not initialized",
);
export { getFeishuRuntime, setFeishuRuntime };
