import { emptyPluginConfigSchema, type RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { buildElevenLabsSpeechProvider } from "remoteclaw/plugin-sdk/speech";

const elevenLabsPlugin = {
  id: "elevenlabs",
  name: "ElevenLabs Speech",
  description: "Bundled ElevenLabs speech provider",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    api.registerSpeechProvider(buildElevenLabsSpeechProvider());
  },
};

export default elevenLabsPlugin;
