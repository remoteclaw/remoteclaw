import {
  emptyPluginConfigSchema,
  type AnyAgentTool,
  type RemoteClawPluginApi,
} from "remoteclaw/plugin-sdk/core";
import { createFirecrawlScrapeTool } from "./src/firecrawl-scrape-tool.js";
import { createFirecrawlWebSearchProvider } from "./src/firecrawl-search-provider.js";
import { createFirecrawlSearchTool } from "./src/firecrawl-search-tool.js";

const firecrawlPlugin = {
  id: "firecrawl",
  name: "Firecrawl Plugin",
  description: "Bundled Firecrawl search and scrape plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    api.registerWebSearchProvider(createFirecrawlWebSearchProvider());
    api.registerTool(createFirecrawlSearchTool(api) as AnyAgentTool);
    api.registerTool(createFirecrawlScrapeTool(api) as AnyAgentTool);
  },
};

export default firecrawlPlugin;
