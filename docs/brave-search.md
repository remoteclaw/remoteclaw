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
2. In the dashboard, choose the **Search** plan and generate an API key.
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

- RemoteClaw uses the Brave **Search** plan. If you have a legacy subscription (e.g. the original Free plan with 2,000 queries/month), it remains valid but does not include newer features like LLM Context or higher rate limits.
- Each Brave plan includes **$5/month in free credit** (renewing). The Search plan costs $5 per 1,000 requests, so the credit covers 1,000 queries/month. Set your usage limit in the Brave dashboard to avoid unexpected charges. See the [Brave API portal](https://brave.com/search/api/) for current plans.
- The Search plan includes the LLM Context endpoint and AI inference rights. Storing results to train or tune models requires a plan with explicit storage rights. See the Brave [Terms of Service](https://api-dashboard.search.brave.com/terms-of-service).
- Results are cached for 15 minutes by default (configurable via `cacheTtlMinutes`).

See [Web tools](/tools/web) for the full web_search configuration.
