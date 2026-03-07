---
description: "Audit what can spend money, which keys are used, and how to view usage"
read_when:
  - You want to understand which features may call paid APIs
  - You need to audit keys, costs, and usage visibility
  - You’re explaining /status or /usage cost reporting
title: "API Usage and Costs"
---

# API usage & costs

This doc lists **features that can invoke API keys** and where their costs show up. It focuses on
RemoteClaw features that can generate provider usage or paid API calls.

## Where costs show up (chat + CLI)

**Per-session cost snapshot**

- `/status` shows the current session model, context usage, and last response tokens.
- If the model uses **API-key auth**, `/status` also shows **estimated cost** for the last reply.

**Per-message cost footer**

- `/usage full` appends a usage footer to every reply, including **estimated cost** (API-key only).
- `/usage tokens` shows tokens only; OAuth flows hide dollar cost.

**CLI usage windows (provider quotas)**

- `remoteclaw status --usage` and `remoteclaw channels list` show provider **usage windows**
  (quota snapshots, not per-message costs).

See [Token use & costs](/reference/token-use) for details and examples.

## How keys are discovered

RemoteClaw can pick up credentials from:

- **Auth profiles** (per-agent, stored in `auth-profiles.json`).
- **Environment variables** (e.g. `OPENAI_API_KEY`, `BRAVE_API_KEY`, `FIRECRAWL_API_KEY`).
- **Config** (`models.providers.*.apiKey`, `tools.web.search.*`, `tools.web.fetch.firecrawl.*`,
  `talk.apiKey`).
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

### 3) Web search tool (Brave / Perplexity via OpenRouter)

`web_search` uses API keys and may incur usage charges:

- **Brave Search API**: `BRAVE_API_KEY` or `tools.web.search.apiKey`
- **Perplexity** (via OpenRouter): `PERPLEXITY_API_KEY` or `OPENROUTER_API_KEY`

**Brave free tier (generous):**

- **2,000 requests/month**
- **1 request/second**
- **Credit card required** for verification (no charge unless you upgrade)

See [Web tools](/tools/web).

### 4) Web fetch tool (Firecrawl)

`web_fetch` can call **Firecrawl** when an API key is present:

- `FIRECRAWL_API_KEY` or `tools.web.fetch.firecrawl.apiKey`

If Firecrawl isn’t configured, the tool falls back to direct fetch + readability (no paid API).

See [Web tools](/tools/web).

### 5) Provider usage snapshots (status/health)

Some status commands call **provider usage endpoints** to display quota windows or auth health.
These are typically low-volume calls but still hit provider APIs:

- `remoteclaw status --usage`
- `remoteclaw models status --json`

See [Model providers](/concepts/model-providers).

### 6) Compaction safeguard summarization

The compaction safeguard can summarize session history using the **current model**, which
invokes provider APIs when it runs.

See [Session management + compaction](/reference/session-management-compaction).

### 7) Model scan / probe

`remoteclaw models scan` can probe OpenRouter models and uses `OPENROUTER_API_KEY` when
probing is enabled.

See [Model providers](/concepts/model-providers).

### 8) Talk (speech)

Talk mode can invoke **ElevenLabs** when configured:

- `ELEVENLABS_API_KEY` or `talk.apiKey`

See [Talk mode](/nodes/talk).

### 9) Skills (third-party APIs)

Skills can store `apiKey` in `skills.entries.<name>.apiKey`. If a skill uses that key for external
APIs, it can incur costs according to the skill’s provider.

Skills can store API keys in `skills.entries.<name>.apiKey`.
