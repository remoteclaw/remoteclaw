import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/line";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/line";
import { registerLineCardCommand } from "./src/card-command.js";
import { linePlugin } from "./src/channel.js";
import { setLineRuntime } from "./src/runtime.js";

export { linePlugin } from "./src/channel.js";
export { setLineRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "line",
  name: "LINE",
  description: "LINE Messaging API channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setLineRuntime(api.runtime);
    api.registerChannel({ plugin: linePlugin });
    registerLineCardCommand(api);
  },
};

export default plugin;
