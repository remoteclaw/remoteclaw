---
summary: "Audit what can spend money, which keys are used, and how to view usage"
read_when:
  - You want to understand which features may call paid APIs
  - You need to audit keys and usage visibility
  - You’re explaining /status or /usage reporting
title: "API Usage and Costs"
---

# API usage & costs

This doc lists **features that can invoke API keys** and where their usage shows up. It focuses on
RemoteClaw features that can generate provider usage or paid API calls.

## Where usage shows up (chat)

**Per-session token snapshot**

- `/status` shows the current session model, context usage, and last response tokens.

**Per-message token footer**

- `/usage full` appends a usage footer to every reply.
- `/usage tokens` shows token counts only.

See [Token use & costs](/reference/token-use) for details and examples.

## How keys are discovered

RemoteClaw can pick up credentials from:

- **Auth profiles** (per-agent, stored in `auth-profiles.json`).
- **Environment variables** (e.g. `OPENAI_API_KEY`, `BRAVE_API_KEY`, `FIRECRAWL_API_KEY`).
- **Config** (`models.providers.*.apiKey`, `tools.web.search.*`, `tools.web.fetch.firecrawl.*`,
  `memorySearch.*`, `talk.apiKey`).
- **Skills** (`skills.entries.<name>.apiKey`) which may export keys to the skill process env.

## Features that can spend keys

### 1) Core model responses (chat + tools)

Every reply or tool call uses the **current model provider** (OpenAI, Anthropic, etc). This is the
primary source of usage and cost.

See [Models](/providers/models) for pricing config and [Token use & costs](/reference/token-use) for display.

### 2) Media understanding (audio/image/video)

Inbound media can be summarized/transcribed before the reply runs. This uses model/provider APIs.

- Audio: OpenAI / Groq / Deepgram (now **auto-enabled** when keys exist).
- Image: OpenAI / Anthropic / Google.
- Video: Google.

See [Media understanding](/nodes/media-understanding).

### 3) Memory embeddings + semantic search

Semantic memory search uses **embedding APIs** when configured for remote providers:

- `memorySearch.provider = "openai"` → OpenAI embeddings
- `memorySearch.provider = "gemini"` → Gemini embeddings
- `memorySearch.provider = "voyage"` → Voyage embeddings
- `memorySearch.provider = "mistral"` → Mistral embeddings
- `memorySearch.provider = "ollama"` → Ollama embeddings (local/self-hosted; typically no hosted API billing)
- Optional fallback to a remote provider if local embeddings fail

You can keep it local with `memorySearch.provider = "local"` (no API usage).

See [Memory](/concepts/memory).

### 4) Web search tool

`web_search` uses API keys and may incur usage charges depending on your provider:

- **Perplexity Search API**: `PERPLEXITY_API_KEY`
- **Brave Search API**: `BRAVE_API_KEY` or `tools.web.search.apiKey`
- **Gemini (Google Search)**: `GEMINI_API_KEY`
- **Grok (xAI)**: `XAI_API_KEY`
- **Kimi (Moonshot)**: `KIMI_API_KEY` or `MOONSHOT_API_KEY`

See [Web tools](/tools/web).

### 5) Web fetch tool (Firecrawl)

`web_fetch` can call **Firecrawl** when an API key is present:

- `FIRECRAWL_API_KEY` or `tools.web.fetch.firecrawl.apiKey`

If Firecrawl isn’t configured, the tool falls back to direct fetch + readability (no paid API).

See [Web tools](/tools/web).

### 6) Provider usage snapshots (status/health)

Some status commands call **provider usage endpoints** to display quota windows or auth health.
These are typically low-volume calls but still hit provider APIs:

- `remoteclaw status --usage`
- `remoteclaw models status --json`

See [Models CLI](/cli/models).

### 7) Compaction safeguard summarization

The compaction safeguard can summarize session history using the **current model**, which
invokes provider APIs when it runs.

See [Session management + compaction](/reference/session-management-compaction).

### 8) Model scan / probe

`remoteclaw models scan` can probe OpenRouter models and uses `OPENROUTER_API_KEY` when
probing is enabled.

See [Models CLI](/cli/models).

### 9) Talk (speech)

Talk mode can invoke **ElevenLabs** when configured:

- `ELEVENLABS_API_KEY` or `talk.apiKey`

See [Talk mode](/nodes/talk).

### 10) Skills (third-party APIs)

Skills can store `apiKey` in `skills.entries.<name>.apiKey`. If a skill uses that key for external
APIs, it can incur costs according to the skill’s provider.

See [Skills](/tools/skills).
