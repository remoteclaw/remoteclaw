import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/telegram";

const { setRuntime: setTelegramRuntime, getRuntime: getTelegramRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Telegram runtime not initialized");
export { getTelegramRuntime, setTelegramRuntime };
