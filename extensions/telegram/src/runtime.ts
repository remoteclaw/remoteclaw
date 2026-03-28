import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/core";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";

const { setRuntime: setTelegramRuntime, getRuntime: getTelegramRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Telegram runtime not initialized");
export { getTelegramRuntime, setTelegramRuntime };
