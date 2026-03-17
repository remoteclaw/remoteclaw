import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk";
import { mattermostPlugin } from "./src/channel.js";
import { getSlashCommandState, registerSlashCommandRoute } from "./src/mattermost/slash-state.js";
import { setMattermostRuntime } from "./src/runtime.js";

export { mattermostPlugin } from "./src/channel.js";
export { setMattermostRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "mattermost",
  name: "Mattermost",
  description: "Mattermost channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setMattermostRuntime(api.runtime);
    api.registerChannel({ plugin: mattermostPlugin });

    // Register the HTTP route for slash command callbacks.
    // The actual command registration with MM happens in the monitor
    // after the bot connects and we know the team ID.
    registerSlashCommandRoute(api);
  },
};

export default plugin;
