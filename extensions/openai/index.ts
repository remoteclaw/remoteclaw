import { emptyPluginConfigSchema, type RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { buildOpenAISpeechProvider } from "remoteclaw/plugin-sdk/speech";
import { buildOpenAICodexProviderPlugin } from "./openai-codex-provider.js";
import { buildOpenAIProvider } from "./openai-provider.js";

const openAIPlugin = {
  id: "openai",
  name: "OpenAI Provider",
  description: "Bundled OpenAI provider plugins",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    api.registerProvider(buildOpenAIProvider());
    api.registerProvider(buildOpenAICodexProviderPlugin());
    api.registerSpeechProvider(buildOpenAISpeechProvider());
  },
};

export default openAIPlugin;
