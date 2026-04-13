---
description: "Usage tracking surfaces and session-level token reporting"
read_when:
  - You need to explain usage tracking behavior
title: "Usage Tracking"
---

# Usage tracking

## What it is

- Tracks session-level token usage from CLI agent run output.
- No direct polling of external APIs; usage data comes from what the CLI runtime reports.

## Where it shows up

- `/status` in chats: emoji‑rich status card with session tokens.
- `/usage off|tokens|full` in chats: per-response usage footer.

## Runtimes

Usage data availability depends on what the CLI runtime reports:

- **Claude**: token usage reported by Claude CLI output.
- **Gemini**: token usage reported by Gemini CLI output.
- **Codex**: token usage reported by Codex CLI output.
- **OpenCode**: token usage reported by OpenCode CLI output.

Usage data is only available after at least one CLI agent run has completed for the session.
