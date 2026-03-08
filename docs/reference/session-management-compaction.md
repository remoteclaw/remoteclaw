---
description: "Deep dive: session store + transcripts, lifecycle, and silent housekeeping"
read_when:
  - You need to debug session ids, transcript JSONL, or sessions.json fields
  - You want to implement silent system turns
title: "Session Management Deep Dive"
---

# Session Management (Deep Dive)

This document explains how RemoteClaw manages sessions end-to-end:

- **Session routing** (how inbound messages map to a `sessionKey`)
- **Session store** (`sessions.json`) and what it tracks
- **Transcript persistence** (`*.jsonl`) and its structure
- **Transcript hygiene** (provider-specific fixups before runs)
- **Context limits** (context window vs tracked tokens)
- **Silent housekeeping** (e.g. memory writes that shouldn’t produce user-visible output)

If you want a higher-level overview first, start with:

- [/concepts/session](/concepts/session)
- [/concepts/session-pruning](/concepts/session-pruning)
- [/reference/transcript-hygiene](/reference/transcript-hygiene)

---

## Source of truth: the Gateway

RemoteClaw is designed around a single **Gateway process** that owns session state.

- UIs (macOS app, web Control UI, TUI) should query the Gateway for session lists and token counts.
- In remote mode, session files are on the remote host; "checking your local Mac files" won’t reflect what the Gateway is using.

---

## Two persistence layers

RemoteClaw persists sessions in two layers:

1. **Session store (`sessions.json`)**
   - Key/value map: `sessionKey -> SessionEntry`
   - Small, mutable, safe to edit (or delete entries)
   - Tracks session metadata (current session id, last activity, toggles, token counters, etc.)

2. **Transcript (`<sessionId>.jsonl`)**
   - Append-only transcript with tree structure (entries have `id` + `parentId`)
   - Stores the actual conversation + tool calls + compaction summaries
   - Used to rebuild the model context for future turns

---

## On-disk locations

Per agent, on the Gateway host:

- Store: `~/.remoteclaw/agents/<agentId>/sessions/sessions.json`
- Transcripts: `~/.remoteclaw/agents/<agentId>/sessions/<sessionId>.jsonl`
  - Telegram topic sessions: `.../<sessionId>-topic-<threadId>.jsonl`

RemoteClaw resolves these via `src/config/sessions.ts`.

---

## Store maintenance and disk controls

Session persistence has automatic maintenance controls (`session.maintenance`) for `sessions.json` and transcript artifacts:

- `mode`: `warn` (default) or `enforce`
- `pruneAfter`: stale-entry age cutoff (default `30d`)
- `maxEntries`: cap entries in `sessions.json` (default `500`)
- `rotateBytes`: rotate `sessions.json` when oversized (default `10mb`)
- `resetArchiveRetention`: retention for `*.reset.<timestamp>` transcript archives (default: same as `pruneAfter`; `false` disables cleanup)
- `maxDiskBytes`: optional sessions-directory budget
- `highWaterBytes`: optional target after cleanup (default `80%` of `maxDiskBytes`)

Enforcement order for disk budget cleanup (`mode: "enforce"`):

1. Remove oldest archived or orphan transcript artifacts first.
2. If still above the target, evict oldest session entries and their transcript files.
3. Keep going until usage is at or below `highWaterBytes`.

In `mode: "warn"`, RemoteClaw reports potential evictions but does not mutate the store/files.

Run maintenance on demand:

```bash
remoteclaw sessions cleanup --dry-run
remoteclaw sessions cleanup --enforce
```

---

## Cron sessions and run logs

Isolated cron runs also create session entries/transcripts, and they have dedicated retention controls:

- `cron.sessionRetention` (default `24h`) prunes old isolated cron run sessions from the session store (`false` disables).
- `cron.runLog.maxBytes` + `cron.runLog.keepLines` prune `~/.remoteclaw/cron/runs/<jobId>.jsonl` files (defaults: `2_000_000` bytes and `2000` lines).

---

## Session keys (`sessionKey`)

A `sessionKey` identifies _which conversation bucket_ you’re in (routing + isolation).

Common patterns:

- Main/direct chat (per agent): `agent:<agentId>:<mainKey>` (default `main`)
- Group: `agent:<agentId>:<channel>:group:<id>`
- Room/channel (Discord/Slack): `agent:<agentId>:<channel>:channel:<id>` or `...:room:<id>`
- Cron: `cron:<job.id>`
- Webhook: `hook:<uuid>` (unless overridden)

The canonical rules are documented at [/concepts/session](/concepts/session).

---

## Session ids (`sessionId`)

Each `sessionKey` points at a current `sessionId` (the transcript file that continues the conversation).

Rules of thumb:

- **Reset** (`/new`, `/reset`) creates a new `sessionId` for that `sessionKey`.
- **Daily reset** (default 4:00 AM local time on the gateway host) creates a new `sessionId` on the next message after the reset boundary.
- **Idle expiry** (`session.reset.idleMinutes` or legacy `session.idleMinutes`) creates a new `sessionId` when a message arrives after the idle window. When daily + idle are both configured, whichever expires first wins.

Implementation detail: the decision happens in `initSessionState()` in `src/auto-reply/reply/session.ts`.

---

## Session store schema (`sessions.json`)

The store’s value type is `SessionEntry` in `src/config/sessions.ts`.

Key fields (not exhaustive):

- `sessionId`: current transcript id (filename is derived from this unless `sessionFile` is set)
- `updatedAt`: last activity timestamp
- `sessionFile`: optional explicit transcript path override
- `chatType`: `direct | group | room` (helps UIs and send policy)
- `provider`, `subject`, `room`, `space`, `displayName`: metadata for group/channel labeling
- Toggles:
  - `verboseLevel`, `elevatedLevel`
  - `sendPolicy` (per-session override)
- Model selection (per-session overrides for provider routing and CLI runtime flags):
  - `modelOverride`: model to pass to the CLI runtime (e.g. `--model` flag)
  - `providerOverride`: which provider to route to (e.g. `anthropic`, `openai`)
- Token counters (best-effort / provider-dependent):
  - `inputTokens`, `outputTokens`, `totalTokens`, `contextTokens`

The store is safe to edit, but the Gateway is the authority: it may rewrite or rehydrate entries as sessions run.

---

## Transcript structure (`*.jsonl`)

Transcripts are managed by RemoteClaw’s `SessionManager`.

The file is JSONL:

- First line: session header (`type: "session"`, includes `id`, `cwd`, `timestamp`, optional `parentSession`)
- Then: session entries with `id` + `parentId` (tree)

Notable entry types:

- `message`: user/assistant/toolResult messages
- `custom_message`: extension-injected messages that _do_ enter model context (can be hidden from UI)
- `custom`: extension state that does _not_ enter model context
- `compaction`: persisted compaction summary with `firstKeptEntryId` and `tokensBefore`
- `branch_summary`: persisted summary when navigating a tree branch

RemoteClaw intentionally does **not** "fix up" transcripts; the Gateway uses `SessionManager` to read/write them.

---

## Context windows vs tracked tokens

Two different concepts matter:

1. **Model context window**: hard cap per model (tokens visible to the model)
2. **Session store counters**: rolling stats written into `sessions.json` (used for /status and dashboards)

If you’re tuning limits:

- The context window is determined by the CLI runtime (e.g., the model the CLI agent is using) and can be overridden via config.
- `contextTokens` in the store is a runtime estimate/reporting value; don’t treat it as a strict guarantee.

For more, see [/token-use](/reference/token-use).

---

## Silent housekeeping (`NO_REPLY`)

RemoteClaw supports "silent" turns for background tasks where the user should not see intermediate output.

Convention:

- The assistant starts its output with `NO_REPLY` to indicate "do not deliver a reply to the user".
- RemoteClaw strips/suppresses this in the delivery layer.

As of `2026.1.10`, RemoteClaw also suppresses **draft/typing streaming** when a partial chunk begins with `NO_REPLY`, so silent operations don’t leak partial output mid-turn.

---

## Troubleshooting checklist

- Session key wrong? Start with [/concepts/session](/concepts/session) and confirm the `sessionKey` in `/status`.
- Store vs transcript mismatch? Confirm the Gateway host and the store path from `remoteclaw status`.
- Silent turns leaking? Confirm the reply starts with `NO_REPLY` (exact token) and you’re on a build that includes the streaming suppression fix.
