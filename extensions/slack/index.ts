import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/slack";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/slack";
import { slackPlugin } from "./src/channel.js";
import { setSlackRuntime } from "./src/runtime.js";

export { slackPlugin } from "./src/channel.js";
export { setSlackRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "slack",
  name: "Slack",
  description: "Slack channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setSlackRuntime(api.runtime);
    api.registerChannel({ plugin: slackPlugin });
  },
};

export default plugin;
