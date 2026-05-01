import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setQQBotRuntime, getRuntime: getQQBotRuntime } = createPluginRuntimeStore<PluginRuntime>(
  "QQBot runtime not initialized",
);
export { getQQBotRuntime, setQQBotRuntime };
