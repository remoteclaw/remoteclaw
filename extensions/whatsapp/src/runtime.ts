// Whatsapp plugin module implements runtime behavior.
import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const {
  setRuntime: setWhatsAppRuntime,
  getRuntime: getWhatsAppRuntime,
  tryGetRuntime: getOptionalWhatsAppRuntime,
} = createPluginRuntimeStore<PluginRuntime>({
  pluginId: "whatsapp",
  errorMessage: "WhatsApp runtime not initialized",
});
export { getOptionalWhatsAppRuntime, getWhatsAppRuntime, setWhatsAppRuntime };
