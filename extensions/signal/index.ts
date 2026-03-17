import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/signal";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/signal";
import { signalPlugin } from "./src/channel.js";
import { setSignalRuntime } from "./src/runtime.js";

export { signalPlugin } from "./src/channel.js";
export { setSignalRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "signal",
  name: "Signal",
  description: "Signal channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setSignalRuntime(api.runtime);
    api.registerChannel({ plugin: signalPlugin });
  },
};

export default plugin;
