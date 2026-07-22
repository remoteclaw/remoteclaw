import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/core";
import { smsPlugin } from "./src/channel.js";
import { setSmsRuntime } from "./src/runtime.js";

const plugin = {
  id: "sms",
  name: "SMS",
  description: "Twilio SMS channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setSmsRuntime(api.runtime);
    api.registerChannel({ plugin: smsPlugin });
  },
};

export default plugin;
