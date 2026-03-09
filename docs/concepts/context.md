---
description: "Context: what the model sees, how it is built, and how to inspect it"
read_when:
  - You want to understand what “context” means in RemoteClaw
  - You are debugging why the model “knows” something (or forgot it)
  - You want to reduce context overhead (/context, /status, /compact)
title: "Context"
---

# Context

“Context” is **everything RemoteClaw injects into the CLI agent’s input for a run**. The CLI agent ultimately sends content to the model, bounded by the model’s **context window** (token limit).

Beginner mental model:

- **System prompt** (RemoteClaw-built): rules, time/runtime, and injected workspace files.
- **Conversation history**: your messages + the assistant’s messages for this session.
- **Tool calls/results + attachments**: command output, file reads, images/audio, etc.

Context is _not the same thing_ as “memory”: memory can be stored on disk and reloaded later; context is what’s inside the model’s current window.

## Quick start (inspect context)

- `/status` → quick “how full is my window?” view + session settings.
- `/context list` → what’s injected + rough sizes (per file + totals).
- `/context detail` → deeper breakdown: per-file, per-tool schema sizes, per-skill entry sizes, and system prompt size.
- `/usage tokens` → append per-reply usage footer to normal replies.
- `/compact` → summarize older history into a compact entry to free window space.

See also: [Slash commands](/tools/slash-commands), [Token use & costs](/reference/token-use).

## Example output

Values vary by runtime, tool policy, and what’s in your workspace.

### `/context list`

```
🧠 Context breakdown
Workspace: <workspaceDir>
System prompt (run): 38,412 chars (~9,603 tok) (Project Context 23,901 chars (~5,976 tok))

Workspace files:
- HEARTBEAT.md: MISSING | raw 0 | injected 0

MCP tools: read, edit, write, exec, process, browser, message, sessions_send, …
Tool schemas (JSON): 31,988 chars (~7,997 tok) (counts toward context; not shown as text)

Session tokens (cached): 14,250 total / ctx=32,000
```

### `/context detail`

```
🧠 Context breakdown (detailed)
…
Top tools (schema size):
- browser: 9,812 chars (~2,453 tok)
- exec: 6,240 chars (~1,560 tok)
… (+N more tools)
```

## What counts toward the context window

Everything the model receives counts, including:

- System prompt (all sections).
- Conversation history.
- Tool calls + tool results.
- Attachments/transcripts (images/audio/files).
- Compaction summaries and pruning artifacts.

## How RemoteClaw builds the system prompt

The system prompt is **RemoteClaw-owned** and rebuilt each run. It includes:

- Workspace location.
- Time (UTC + converted user time if configured).
- Runtime metadata (host/OS/model/thinking).
- Workspace context files (`HEARTBEAT.md`).

Full breakdown: [System Prompt](/concepts/system-prompt).

## Workspace files

RemoteClaw reads workspace files (`HEARTBEAT.md`) when present.
Agent CLIs load their own config files (e.g. `CLAUDE.md` for Claude Code).
See [Agent workspace](/concepts/agent-workspace) for the full layout.

## MCP tools

RemoteClaw exposes MCP tools (messaging, sessions, cron, canvas, etc.) to the
CLI agent via the gateway. Tool schemas (JSON) count toward context even though
you don’t see them as plain text.

`/context detail` breaks down the biggest tool schemas so you can see what dominates.

## Commands, directives, and “inline shortcuts”

Slash commands are handled by the Gateway. There are a few different behaviors:

- **Standalone commands**: a message that is only `/...` runs as a command.
- **Directives**: `/think`, `/verbose`, `/reasoning`, `/elevated`, `/model`, `/queue` are stripped before the model sees the message.
  - Directive-only messages persist session settings.
  - Inline directives in a normal message act as per-message hints.
- **Inline shortcuts** (allowlisted senders only): certain `/...` tokens inside a normal message can run immediately (example: “hey /status”), and are stripped before the model sees the remaining text.

Details: [Slash commands](/tools/slash-commands).

## Sessions, compaction, and pruning (what persists)

What persists across messages depends on the mechanism:

- **Normal history** persists in the session transcript until compacted/pruned by policy.
- **Compaction** persists a summary into the transcript and keeps recent messages intact.
- **Pruning** removes old tool results from the _in-memory_ prompt for a run, but does not rewrite the transcript.

Docs: [Session](/concepts/session), [Session pruning](/concepts/session-pruning).

## What `/context` actually reports

`/context` prefers the latest **run-built** system prompt report when available:

- `System prompt (run)` = captured from the last CLI agent run and persisted in the session store.
- `System prompt (estimate)` = computed on the fly when no run report exists yet for the session.

Either way, it reports sizes and top contributors; it does **not** dump the full system prompt or tool schemas.
