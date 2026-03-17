import { emptyPluginConfigSchema, type RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import {
  createPluginBackedWebSearchProvider,
  getScopedCredentialValue,
  setScopedCredentialValue,
} from "remoteclaw/plugin-sdk/provider-web-search";

const perplexityPlugin = {
  id: "perplexity",
  name: "Perplexity Plugin",
  description: "Bundled Perplexity plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    api.registerWebSearchProvider(
      createPluginBackedWebSearchProvider({
        id: "perplexity",
        label: "Perplexity Search",
        hint: "Structured results · domain/country/language/time filters",
        envVars: ["PERPLEXITY_API_KEY", "OPENROUTER_API_KEY"],
        placeholder: "pplx-...",
        signupUrl: "https://www.perplexity.ai/settings/api",
        docsUrl: "https://docs.openclaw.ai/perplexity",
        autoDetectOrder: 50,
        getCredentialValue: (searchConfig) => getScopedCredentialValue(searchConfig, "perplexity"),
        setCredentialValue: (searchConfigTarget, value) =>
          setScopedCredentialValue(searchConfigTarget, "perplexity", value),
      }),
    );
  },
};

export default perplexityPlugin;
