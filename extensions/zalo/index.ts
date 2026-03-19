import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/core";
import { zaloDock, zaloPlugin } from "./src/channel.js";
import { setZaloRuntime } from "./src/runtime.js";

const plugin = {
  id: "zalo",
  name: "Zalo",
  description: "Zalo channel plugin (Bot API)",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setZaloRuntime(api.runtime);
    api.registerChannel({ plugin: zaloPlugin, dock: zaloDock });
  },
};

export default plugin;
