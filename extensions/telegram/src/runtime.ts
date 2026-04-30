import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const {
  setRuntime: setTelegramRuntime,
  clearRuntime: clearTelegramRuntime,
  getRuntime: getTelegramRuntime,
} = createPluginRuntimeStore<PluginRuntime>("Telegram runtime not initialized");
export { clearTelegramRuntime, getTelegramRuntime, setTelegramRuntime };
