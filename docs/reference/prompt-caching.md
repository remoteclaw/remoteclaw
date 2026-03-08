---
title: "Prompt Caching"
description: "Prompt caching knobs, merge order, provider behavior, and tuning patterns"
read_when:
  - You want to reduce prompt token costs with cache retention
  - You need per-agent cache behavior in multi-agent setups
  - You are tuning heartbeat and cache-ttl pruning together
---

# Prompt caching

Prompt caching means the model provider can reuse unchanged prompt prefixes (usually system/developer instructions and other stable context) across turns instead of re-processing them every time. The first matching request writes cache tokens (`cacheWrite`), and later matching requests can read them back (`cacheRead`).

Why this matters: lower token cost, faster responses, and more predictable performance for long-running sessions. Without caching, repeated prompts pay the full prompt cost on every turn even when most input did not change.

This page covers all cache-related knobs that affect prompt reuse and token cost.

For Anthropic pricing details, see:
[https://docs.anthropic.com/docs/build-with-claude/prompt-caching](https://docs.anthropic.com/docs/build-with-claude/prompt-caching)

## Primary knobs

### `cacheRetention` (per-agent)

Set cache retention in per-agent params:

```yaml
agents:
  list:
    - id: "research"
      params:
        cacheRetention: "short" # none | short | long
    - id: "alerts"
      params:
        cacheRetention: "none"
```

### Legacy `cacheControlTtl`

Legacy values are still accepted and mapped:

- `5m` -> `short`
- `1h` -> `long`

Prefer `cacheRetention` for new config.

### `contextPruning.mode: "cache-ttl"`

Prunes old tool-result context after cache TTL windows so post-idle requests do not re-cache oversized history.

```yaml
agents:
  defaults:
    contextPruning:
      mode: "cache-ttl"
      ttl: "1h"
```

See [Session Pruning](/concepts/session-pruning) for full behavior.

### Heartbeat keep-warm

Heartbeat can keep cache windows warm and reduce repeated cache writes after idle gaps.

```yaml
agents:
  defaults:
    heartbeat:
      every: "55m"
```

Per-agent heartbeat is supported at `agents.list[].heartbeat`.

## Provider behavior

### Anthropic (direct API)

- `cacheRetention` is supported.
- When no explicit `cacheRetention` is set for an Anthropic model ref, RemoteClaw defaults to `"short"`.

### Amazon Bedrock

- Anthropic Claude model refs on Bedrock support `cacheRetention` — the CLI agent passes the value through to the Bedrock API.
- Non-Anthropic Bedrock models do not support prompt caching; `cacheRetention` has no effect on them.

### OpenRouter Anthropic models

For `openrouter/anthropic/*` model refs, the CLI agent handles Anthropic `cache_control` headers on system/developer prompt blocks to improve prompt-cache reuse.

### Other providers

Whether `cacheRetention` has any effect depends on the CLI agent and the underlying model API. For providers without prompt-caching support, the setting is silently ignored.

## Tuning patterns

### Mixed traffic (recommended default)

Keep a long-lived baseline on your main agent, disable caching on bursty notifier agents:

```yaml
agents:
  list:
    - id: "research"
      default: true
      params:
        cacheRetention: "long"
      heartbeat:
        every: "55m"
    - id: "alerts"
      params:
        cacheRetention: "none"
```

### Cost-first baseline

- Set baseline `cacheRetention: "short"`.
- Enable `contextPruning.mode: "cache-ttl"`.
- Keep heartbeat below your TTL only for agents that benefit from warm caches.

## Cache diagnostics

RemoteClaw exposes dedicated cache-trace diagnostics for agent runs.

### `diagnostics.cacheTrace` config

```yaml
diagnostics:
  cacheTrace:
    enabled: true
    filePath: "~/.remoteclaw/logs/cache-trace.jsonl" # optional
    includeMessages: false # default true
    includePrompt: false # default true
    includeSystem: false # default true
```

Defaults:

- `filePath`: `$REMOTECLAW_STATE_DIR/logs/cache-trace.jsonl`
- `includeMessages`: `true`
- `includePrompt`: `true`
- `includeSystem`: `true`

### Env toggles (one-off debugging)

- `REMOTECLAW_CACHE_TRACE=1` enables cache tracing.
- `REMOTECLAW_CACHE_TRACE_FILE=/path/to/cache-trace.jsonl` overrides output path.
- `REMOTECLAW_CACHE_TRACE_MESSAGES=0|1` toggles full message payload capture.
- `REMOTECLAW_CACHE_TRACE_PROMPT=0|1` toggles prompt text capture.
- `REMOTECLAW_CACHE_TRACE_SYSTEM=0|1` toggles system prompt capture.

### What to inspect

- Cache trace events are JSONL and include staged snapshots like `session:loaded`, `prompt:before`, `stream:context`, and `session:after`.
- Per-turn cache token impact is visible in normal usage surfaces via `cacheRead` and `cacheWrite` (for example `/usage full` and session usage summaries).

## Quick troubleshooting

- High `cacheWrite` on most turns: check for volatile system-prompt inputs and verify that your model/provider supports prompt caching.
- No effect from `cacheRetention`: confirm the setting is present in the agent's `params` block and that the CLI agent and provider support it.
- Non-Anthropic Bedrock models ignore `cacheRetention` — this is expected.

Related docs:

- [Token Use and Costs](/reference/token-use)
- [Session Pruning](/concepts/session-pruning)
- [Gateway Configuration Reference](/gateway/configuration-reference)
