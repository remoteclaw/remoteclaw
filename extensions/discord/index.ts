import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/discord";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/discord";
import { discordPlugin } from "./src/channel.js";
import { setDiscordRuntime } from "./src/runtime.js";
import { registerDiscordSubagentHooks } from "./src/subagent-hooks.js";

export { discordPlugin } from "./src/channel.js";
export { setDiscordRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "discord",
  name: "Discord",
  description: "Discord channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setDiscordRuntime(api.runtime);
    api.registerChannel({ plugin: discordPlugin });
    registerDiscordSubagentHooks(api);
  },
};

export default plugin;
