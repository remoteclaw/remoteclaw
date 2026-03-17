import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/imessage";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/imessage";
import { imessagePlugin } from "./src/channel.js";
import { setIMessageRuntime } from "./src/runtime.js";

export { imessagePlugin } from "./src/channel.js";
export { setIMessageRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "imessage",
  name: "iMessage",
  description: "iMessage channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setIMessageRuntime(api.runtime);
    api.registerChannel({ plugin: imessagePlugin });
  },
};

export default plugin;
