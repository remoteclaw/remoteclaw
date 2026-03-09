---
description: "Agent runtime and workspace contract"
read_when:
  - Changing agent runtime, workspace, or session behavior
title: "Agent Runtime"
---

# Agent Runtime 🤖

RemoteClaw runs agent CLIs (Claude, Gemini, Codex, OpenCode) as subprocess runtimes.

## Workspace (required)

RemoteClaw uses a single agent workspace directory (`agents.defaults.workspace`) as the agent’s **only** working directory (`cwd`) for tools and context.

Recommended: use `remoteclaw setup` to create `~/.remoteclaw/remoteclaw.json` if missing and initialize the workspace files.

Full workspace layout + backup guide: [Agent workspace](/concepts/agent-workspace)

If `agents.defaults.sandbox` is enabled, non-main sessions can override this with
per-session workspaces under `agents.defaults.sandbox.workspaceRoot` (see
[Gateway configuration](/gateway/configuration)).

## Workspace files

The workspace is a plain working directory. Agents bring their own configuration
(e.g. `CLAUDE.md` for Claude Code, `.gemini/` for Gemini CLI). RemoteClaw does
not seed or manage template files in the workspace.

Files that RemoteClaw may read or write:

- `HEARTBEAT.md` — optional tiny checklist for heartbeat runs
- Boot prompt file — configurable path via `agents.defaults.boot.file`
- `memory/YYYY-MM-DD.md` — daily memory log
- `MEMORY.md` — optional curated long-term memory

See [Agent workspace](/concepts/agent-workspace) for the full layout.

## Built-in tools

The CLI agent brings its own tool set (e.g., Claude Code's built-in
read/write/bash tools). RemoteClaw exposes additional MCP tools (messaging,
sessions, cron, canvas, etc.) via the gateway.

## Skills

RemoteClaw loads skills from three locations (workspace wins on name conflict):

- Bundled (shipped with the install)
- Managed/local: `~/.remoteclaw/skills`
- Workspace: `<workspace>/skills`

Skills loading from each location can be enabled or disabled via config (see `skills` in [Gateway configuration](/gateway/configuration)).

## Sessions

Session transcripts are stored as JSONL at:

- `~/.remoteclaw/agents/<agentId>/sessions/<SessionId>.jsonl`

The session ID is stable and chosen by RemoteClaw.
Session folders from prior OpenClaw versions (Pi/Tau) are **not** read.

## Steering while streaming

When queue mode is `steer`, inbound messages are injected into the current run.
The queue is checked **after each tool call**; if a queued message is present,
remaining tool calls from the current assistant message are skipped (error tool
results with "Skipped due to queued user message."), then the queued user
message is injected before the next assistant response.

When queue mode is `followup` or `collect`, inbound messages are held until the
current turn ends, then a new agent turn starts with the queued payloads. See
[Queue](/concepts/queue) for mode + debounce/cap behavior.

Block streaming sends completed assistant blocks as soon as they finish; it is
**off by default** (`agents.defaults.blockStreamingDefault: "off"`).
Tune the boundary via `agents.defaults.blockStreamingBreak` (`text_end` vs `message_end`; defaults to text_end).
Control soft block chunking with `agents.defaults.blockStreamingChunk` (defaults to
800–1200 chars; prefers paragraph breaks, then newlines; sentences last).
Coalesce streamed chunks with `agents.defaults.blockStreamingCoalesce` to reduce
single-line spam (idle-based merging before send). Non-Telegram channels require
explicit `*.blockStreaming: true` to enable block replies.
Verbose tool summaries are emitted at tool start (no debounce); Control UI
streams tool output via agent events when available.
More details: [Streaming + chunking](/concepts/streaming).

## Configuration (minimal)

At minimum, set:

- `agents.defaults.workspace`
- `channels.whatsapp.allowFrom` (strongly recommended)

---

_Next: [Group Chats](/channels/group-messages)_ 🦀
