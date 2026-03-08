---
description: "Brave Search API setup for web_search"
read_when:
  - You want to use Brave Search for web_search
  - You need a BRAVE_API_KEY or plan details
title: "Brave Search"
---

# Brave Search API

Brave Search can be configured as the web search provider when using RemoteClaw's built-in `web_search` tool.

## Get an API key

1. Create a Brave Search API account at [https://brave.com/search/api/](https://brave.com/search/api/)
2. In the dashboard, choose the **Data for Search** plan and generate an API key.
3. Set `BRAVE_API_KEY` in the Gateway environment, or configure it in `tools.web.search`.

## Config example

> **Note:** The `tools.web.search` configuration applies only when RemoteClaw's built-in web search tool is in use. If your CLI agent provides its own web search capability (e.g., via MCP), configure the API key in the agent's own configuration instead.

```json5
{
  tools: {
    web: {
      search: {
        provider: "brave",
        apiKey: "BRAVE_API_KEY_HERE",
        maxResults: 5,
        timeoutSeconds: 30,
      },
    },
  },
}
```

## Notes

- The Data for AI plan is **not** compatible with `web_search`.
- Brave provides a free tier plus paid plans; check the Brave API portal for current limits.

See [Web tools](/tools/web) for the full web_search configuration.
