---
description: "Perplexity Search API and Sonar/OpenRouter compatibility for web_search"
read_when:
  - You want to use Perplexity Search for web search
  - You need PERPLEXITY_API_KEY or OPENROUTER_API_KEY setup
title: "Perplexity Search"
---

# Perplexity Sonar

RemoteClaw can use Perplexity Sonar for the `web_search` tool. You can connect
through Perplexity's direct API or via OpenRouter.

For compatibility, RemoteClaw also supports legacy Perplexity Sonar/OpenRouter setups.
If you use `OPENROUTER_API_KEY`, an `sk-or-...` key in `tools.web.search.perplexity.apiKey`, or set `tools.web.search.perplexity.baseUrl` / `model`, the provider switches to the chat-completions path and returns AI-synthesized answers with citations instead of structured Search API results.

## Getting a Perplexity API key

### Perplexity (direct)

- Base URL: [https://api.perplexity.ai](https://api.perplexity.ai)
- Environment variable: `PERPLEXITY_API_KEY`

### OpenRouter (alternative)

- Base URL: [https://openrouter.ai/api/v1](https://openrouter.ai/api/v1)
- Environment variable: `OPENROUTER_API_KEY`
- Supports prepaid/crypto credits.

## OpenRouter compatibility

If you were already using OpenRouter for Perplexity Sonar, keep `provider: "perplexity"` and set `OPENROUTER_API_KEY` in the Gateway environment, or store an `sk-or-...` key in `tools.web.search.perplexity.apiKey`.

Optional legacy controls:

- `tools.web.search.perplexity.baseUrl`
- `tools.web.search.perplexity.model`

## Config examples

### Native Perplexity Search API

```json5
{
  tools: {
    web: {
      search: {
        provider: "perplexity",
        perplexity: {
          apiKey: "pplx-...",
          baseUrl: "https://api.perplexity.ai",
          model: "perplexity/sonar-pro",
        },
      },
    },
  },
}
```

### OpenRouter / Sonar compatibility

```json5
{
  tools: {
    web: {
      search: {
        provider: "perplexity",
        perplexity: {
          apiKey: "<openrouter-api-key>",
          baseUrl: "https://openrouter.ai/api/v1",
          model: "perplexity/sonar-pro",
        },
      },
    },
  },
}
```

## Where to set the key

**Via config:** run `remoteclaw configure --section web`. It stores the key in
`~/.remoteclaw/remoteclaw.json` under `tools.web.search.perplexity.apiKey`.

**Via environment:** set `PERPLEXITY_API_KEY` or `OPENROUTER_API_KEY`
in the Gateway process environment. For a gateway install, put it in
`~/.remoteclaw/.env` (or your service environment). See [Env vars](/help/faq#how-does-remoteclaw-load-environment-variables).

## Tool parameters

These parameters apply to the native Perplexity Search API path.

| Parameter             | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `query`               | Search query (required)                              |
| `count`               | Number of results to return (1-10, default: 5)       |
| `country`             | 2-letter ISO country code (e.g., "US", "DE")         |
| `language`            | ISO 639-1 language code (e.g., "en", "de", "fr")     |
| `freshness`           | Time filter: `day` (24h), `week`, `month`, or `year` |
| `date_after`          | Only results published after this date (YYYY-MM-DD)  |
| `date_before`         | Only results published before this date (YYYY-MM-DD) |
| `domain_filter`       | Domain allowlist/denylist array (max 20)             |
| `max_tokens`          | Total content budget (default: 25000, max: 1000000)  |
| `max_tokens_per_page` | Per-page token limit (default: 2048)                 |

For the legacy Sonar/OpenRouter compatibility path, only `query` and `freshness` are supported.
Search API-only filters such as `country`, `language`, `date_after`, `date_before`, `domain_filter`, `max_tokens`, and `max_tokens_per_page` return explicit errors.

**Examples:**

```javascript
// Country and language-specific search
await web_search({
  query: "renewable energy",
  country: "DE",
  language: "de",
});

// Recent results (past week)
await web_search({
  query: "AI news",
  freshness: "week",
});

// Date range search
await web_search({
  query: "AI developments",
  date_after: "2024-01-01",
  date_before: "2024-06-30",
});

// Domain filtering (allowlist)
await web_search({
  query: "climate research",
  domain_filter: ["nature.com", "science.org", ".edu"],
});

// Domain filtering (denylist - prefix with -)
await web_search({
  query: "product reviews",
  domain_filter: ["-reddit.com", "-pinterest.com"],
});

// More content extraction
await web_search({
  query: "detailed AI research",
  max_tokens: 50000,
  max_tokens_per_page: 4096,
});
```

If both `PERPLEXITY_API_KEY` and `OPENROUTER_API_KEY` are set, set
`tools.web.search.perplexity.baseUrl` (or `tools.web.search.perplexity.apiKey`)
to disambiguate.

If no base URL is set, RemoteClaw chooses a default based on the API key source:

- `PERPLEXITY_API_KEY` or `pplx-...` → direct Perplexity (`https://api.perplexity.ai`)
- `OPENROUTER_API_KEY` or `sk-or-...` → OpenRouter (`https://openrouter.ai/api/v1`)
- Unknown key formats → OpenRouter (safe fallback)

- Perplexity Search API returns structured web search results (`title`, `url`, `snippet`)
- OpenRouter or explicit `baseUrl` / `model` switches Perplexity back to Sonar chat completions for compatibility
- Results are cached for 15 minutes by default (configurable via `cacheTtlMinutes`)

See [Web tools](/tools/web) for the full web_search configuration.
