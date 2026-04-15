import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/compat";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/whatsapp";

const { setRuntime: setWhatsAppRuntime, getRuntime: getWhatsAppRuntime } =
  createPluginRuntimeStore<PluginRuntime>("WhatsApp runtime not initialized");
export { getWhatsAppRuntime, setWhatsAppRuntime };
