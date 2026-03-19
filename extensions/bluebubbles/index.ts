import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/core";
import { bluebubblesPlugin } from "./src/channel.js";
import { setBlueBubblesRuntime } from "./src/runtime.js";

const plugin = {
  id: "bluebubbles",
  name: "BlueBubbles",
  description: "BlueBubbles channel plugin (macOS app)",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setBlueBubblesRuntime(api.runtime);
    api.registerChannel({ plugin: bluebubblesPlugin });
  },
};

export default plugin;
