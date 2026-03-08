---
title: "Default AGENTS.md"
description: "Default RemoteClaw agent instructions and skills roster for the personal assistant setup"
read_when:
  - Starting a new RemoteClaw agent session
  - Enabling or auditing default skills
---

# AGENTS.md — RemoteClaw Personal Assistant (default)

## First run (recommended)

RemoteClaw uses a dedicated workspace directory for the agent. Configure it via `agents.defaults.workspace` (no built-in default).

1. Create the workspace (if it doesn’t already exist):

```bash
mkdir -p ~/.remoteclaw/workspace
```

2. Configure the workspace path:

```json5
{
  agents: { defaults: { workspace: "~/projects" } },
}
```

3. Run `remoteclaw setup` to create the workspace directory.

> **Note:** RemoteClaw no longer seeds template files in the workspace.
> Agents bring their own config (e.g. `CLAUDE.md` for Claude Code).

## Safety defaults

- Don’t dump directories or secrets into chat.
- Don’t run destructive commands unless explicitly asked.
- Don’t send partial/streaming replies to external messaging surfaces (only final replies).

## Session start (required)

- Read `memory.md` and today+yesterday in `memory/` if present.
- Do it before responding.
- You are a fresh instance each session; continuity lives in these files.

## Shared spaces (recommended)

- You’re not the user’s voice; be careful in group chats or public channels.
- Don’t share private data, contact info, or internal notes.

## Memory system (recommended)

- Daily log: `memory/YYYY-MM-DD.md` (create `memory/` if needed).
- Long-term memory: `memory.md` for durable facts, preferences, and decisions.
- On session start, read today + yesterday + `memory.md` if present.
- Capture: decisions, preferences, constraints, open loops.
- Avoid secrets unless explicitly requested.

## Tools & skills

- Tools live in skills; follow each skill’s `SKILL.md` when you need it.
- Keep environment-specific notes in native agent config.

## Backup tip (recommended)

If you treat this workspace as Clawd’s “memory”, make it a git repo (ideally private) so `AGENTS.md` and your memory files are backed up.

```bash
cd ~/.remoteclaw/workspace
git init
git add AGENTS.md
git commit -m "Add Clawd workspace"
# Optional: add a private remote + push
```

## What RemoteClaw Does

- Runs the WhatsApp gateway and bridges messages to a CLI agent subprocess (claude, gemini, codex, opencode) so the assistant can read/write chats, fetch context, and run skills via the host Mac.
- macOS app manages permissions (screen recording, notifications, microphone) and exposes the `remoteclaw` CLI via its bundled binary.
- Direct chats collapse into the agent's `main` session by default; groups stay isolated as `agent:<agentId>:<channel>:group:<id>` (rooms/channels: `agent:<agentId>:<channel>:channel:<id>`); heartbeats keep background tasks alive.

## Core Skills

- **mcporter** — Tool server runtime/CLI for managing external skill backends.
- **Peekaboo** — Fast macOS screenshots with optional AI vision analysis.
- **camsnap** — Capture frames, clips, or motion alerts from RTSP/ONVIF security cams.
- **oracle** — OpenAI-ready agent CLI with session replay and browser control.
- **eightctl** — Control your sleep, from the terminal.
- **imsg** — Send, read, stream iMessage & SMS.
- **wacli** — WhatsApp CLI: sync, search, send.
- **discord** — Discord actions: react, stickers, polls. Use `user:<id>` or `channel:<id>` targets (bare numeric ids are ambiguous).
- **gog** — Google Suite CLI: Gmail, Calendar, Drive, Contacts.
- **spotify-player** — Terminal Spotify client to search/queue/control playback.
- **sag** — ElevenLabs speech with mac-style say UX; streams to speakers by default.
- **Sonos CLI** — Control Sonos speakers (discover/status/playback/volume/grouping) from scripts.
- **blucli** — Play, group, and automate BluOS players from scripts.
- **OpenHue CLI** — Philips Hue lighting control for scenes and automations.
- **OpenAI Whisper** — Local speech-to-text for quick dictation and voicemail transcripts.
- **Gemini CLI** — Google Gemini models from the terminal for fast Q&A.
- **agent-tools** — Utility toolkit for automations and helper scripts.

## Usage Notes

- Prefer the `remoteclaw` CLI for scripting; mac app handles permissions.
- Install skills by dropping them into `~/.remoteclaw/skills/<name>/SKILL.md` or `<workspace>/skills/<name>/SKILL.md`.
- Keep heartbeats enabled so the assistant can schedule reminders, monitor inboxes, and trigger camera captures.
- Canvas UI runs full-screen with native overlays. Avoid placing critical controls in the top-left/top-right/bottom edges; add explicit gutters in the layout and don’t rely on safe-area insets.
- For browser-driven verification, use `remoteclaw browser` (tabs/status/screenshot) with the RemoteClaw-managed Chrome profile.
- For DOM inspection, use `remoteclaw browser eval|query|dom|snapshot` (and `--json`/`--out` when you need machine output).
- For interactions, use `remoteclaw browser click|type|hover|drag|select|upload|press|wait|navigate|back|evaluate|run` (click/type require snapshot refs; use `evaluate` for CSS selectors).
