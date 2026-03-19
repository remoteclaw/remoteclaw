import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk";
import { createSynologyChatPlugin } from "./src/channel.js";
import { setSynologyRuntime } from "./src/runtime.js";

const plugin = {
  id: "synology-chat",
  name: "Synology Chat",
  description: "Native Synology Chat channel plugin for RemoteClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setSynologyRuntime(api.runtime);
    api.registerChannel({ plugin: createSynologyChatPlugin() });
  },
};

export default plugin;
