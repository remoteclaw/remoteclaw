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

## Where costs show up

**Per-session cost snapshot**

- `/status` shows session info reported by the CLI agent (tokens, context usage).
- Cost visibility depends on the CLI agent's own reporting — RemoteClaw surfaces what the agent
  exposes but does not independently track model costs.

**Per-message cost footer**

- `/usage full` appends a usage footer to every reply.
- `/usage tokens` shows tokens only.

See [Token use & costs](/reference/token-use) for details and examples.

## How keys are discovered

RemoteClaw can pick up credentials from:

- **Auth profiles** (per-agent, stored in `auth-profiles.json`).
- **Environment variables** (e.g. `OPENAI_API_KEY`, `BRAVE_API_KEY`, `FIRECRAWL_API_KEY`).
- **Config** (`tools.web.search.*`, `tools.web.fetch.firecrawl.*`,
  `talk.apiKey`).
- **Skills** (`skills.entries.<name>.apiKey`) which may export keys to the skill process env.

## Features that can spend keys

### 1) CLI agent model responses

The cost of model responses (chat, tool calls) is the CLI agent's concern. RemoteClaw delegates
model interaction to the spawned CLI agent (claude, gemini, codex, opencode), and usage shows up
in the CLI agent's own usage reporting, not in RemoteClaw.

### 2) Media understanding (audio/image/video)

Inbound media may be preprocessed (transcribed, summarized) by RemoteClaw before forwarding to
the CLI agent. This preprocessing can use paid APIs:

- Audio: OpenAI / Groq / Deepgram (auto-enabled when keys exist).
- Image/Video: may use provider APIs for transcription or summarization.

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

### 5) Compaction safeguard summarization

The compaction safeguard can summarize session history by delegating to the CLI agent subprocess.
The cost of this summarization is part of the CLI agent's usage.

See [Session management + compaction](/reference/session-management-compaction).

### 6) Talk (speech)

Talk mode can invoke **ElevenLabs** when configured:

- `ELEVENLABS_API_KEY` or `talk.apiKey`

See [Talk mode](/nodes/talk).

### 7) Skills (third-party APIs)

Skills can store `apiKey` in `skills.entries.<name>.apiKey`. If a skill uses that key for external
APIs, it can incur costs according to the skill’s provider.

Skills can store API keys in `skills.entries.<name>.apiKey`.
