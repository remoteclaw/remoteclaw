---
title: "Session Pruning"
description: "Session pruning: tool-result trimming to reduce context bloat"
read_when:
  - You want to reduce LLM context growth from tool outputs
  - You are tuning agents.defaults.contextPruning
---

# Session Pruning

Session pruning trims **old tool results** from the in-memory context before passing it to the CLI agent subprocess. It does **not** rewrite the on-disk session history (`*.jsonl`).

## When it runs

- When `mode: "cache-ttl"` is enabled and the last CLI agent run for the session is older than `ttl`.
- Only affects the messages passed to the CLI agent subprocess for that run.
- Currently optimized for the Claude runtime (cache-aware TTL behavior).
- For best results, match `ttl` to the CLI agent's cache retention policy (`short` = 5m, `long` = 1h).
- After a prune, the TTL window resets so subsequent requests keep cache until `ttl` expires again.

## Smart defaults

- When cache-TTL pruning is enabled, RemoteClaw applies sensible defaults for heartbeat intervals and cache retention.
- If you set any of these values explicitly, RemoteClaw does **not** override them.

## What this improves

- **Why prune:** reducing the context payload passed to the CLI agent subprocess avoids re-processing stale tool output and can improve cache behavior for runtimes that support prompt caching.
- **What gets cheaper:** pruning reduces the payload size for the first run after the TTL expires.
- **Why the TTL reset matters:** once pruning runs, the cache window resets, so follow‑up runs can reuse the freshly cached context instead of re-processing the full history again.
- **What it does not do:** pruning doesn’t add tokens or “double” costs; it only changes what gets passed to the CLI agent on that first post‑TTL run.

## What can be pruned

- Only `toolResult` messages.
- User + assistant messages are **never** modified.
- The last `keepLastAssistants` assistant messages are protected; tool results after that cutoff are not pruned.
- If there aren’t enough assistant messages to establish the cutoff, pruning is skipped.
- Tool results containing **image blocks** are skipped (never trimmed/cleared).

## Context window estimation

Pruning uses an estimated context window (chars ≈ tokens × 4). The base window is resolved in this order:

1. `agents.defaults.contextTokens` (if set).
2. Default `200000` tokens.

Context window limits are determined by the CLI agent's own configuration; RemoteClaw uses the configured value as a pruning budget estimate.

## Mode

### cache-ttl

- Pruning only runs if the last CLI agent run is older than `ttl` (default `5m`).
- When it runs: same soft-trim + hard-clear behavior as before.

## Soft vs hard pruning

- **Soft-trim**: only for oversized tool results.
  - Keeps head + tail, inserts `...`, and appends a note with the original size.
  - Skips results with image blocks.
- **Hard-clear**: replaces the entire tool result with `hardClear.placeholder`.

## Tool selection

- `tools.allow` / `tools.deny` support `*` wildcards.
- Deny wins.
- Matching is case-insensitive.
- Empty allow list => all tools allowed.

## Interaction with other limits

- Built-in tools already truncate their own output; session pruning is an extra layer that prevents long-running chats from accumulating too much tool output in the model context.
- Compaction is separate: compaction summarizes and persists, pruning is transient per request. See [Session management — compaction](/reference/session-management-compaction).

## Defaults (when enabled)

- `ttl`: `"5m"`
- `keepLastAssistants`: `3`
- `softTrimRatio`: `0.3`
- `hardClearRatio`: `0.5`
- `minPrunableToolChars`: `50000`
- `softTrim`: `{ maxChars: 4000, headChars: 1500, tailChars: 1500 }`
- `hardClear`: `{ enabled: true, placeholder: "[Old tool result content cleared]" }`

## Examples

Default (off):

```json5
{
  agents: { defaults: { contextPruning: { mode: "off" } } },
}
```

Enable TTL-aware pruning:

```json5
{
  agents: { defaults: { contextPruning: { mode: "cache-ttl", ttl: "5m" } } },
}
```

Restrict pruning to specific tools:

```json5
{
  agents: {
    defaults: {
      contextPruning: {
        mode: "cache-ttl",
        tools: { allow: ["exec", "read"], deny: ["*image*"] },
      },
    },
  },
}
```

See config reference: [Gateway Configuration](/gateway/configuration)
