import { emptyPluginConfigSchema, type RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { buildMicrosoftSpeechProvider } from "remoteclaw/plugin-sdk/speech";

const microsoftPlugin = {
  id: "microsoft",
  name: "Microsoft Speech",
  description: "Bundled Microsoft speech provider",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    api.registerSpeechProvider(buildMicrosoftSpeechProvider());
  },
};

export default microsoftPlugin;
