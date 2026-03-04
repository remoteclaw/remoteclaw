import type { OpenClawPluginApi } from "remoteclaw/plugin-sdk/synology-chat";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/synology-chat";
import { createSynologyChatPlugin } from "./src/channel.js";
import { setSynologyRuntime } from "./src/runtime.js";

const plugin = {
  id: "synology-chat",
  name: "Synology Chat",
  description: "Native Synology Chat channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setSynologyRuntime(api.runtime);
    api.registerChannel({ plugin: createSynologyChatPlugin() });
  },
};

export default plugin;
