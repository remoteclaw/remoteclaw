import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setWhatsAppRuntime, getRuntime: getWhatsAppRuntime } = createPluginRuntimeStore<PluginRuntime>(
  "WhatsApp runtime not initialized",
);
export { getWhatsAppRuntime, setWhatsAppRuntime };
