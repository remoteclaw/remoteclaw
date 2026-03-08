---
description: "Usage tracking surfaces and session-level cost reporting"
read_when:
  - You need to explain usage tracking behavior
title: "Usage Tracking"
---

# Usage tracking

## What it is

- Tracks session-level token usage and cost from CLI agent run output.
- No direct polling of external APIs; usage data comes from what the CLI runtime reports.

## Where it shows up

- `/status` in chats: emoji‑rich status card with session tokens + estimated cost.
- `/usage off|tokens|full` in chats: per-response usage footer.
- `/usage cost` in chats: local cost summary aggregated from RemoteClaw session logs.
- CLI: `remoteclaw status --usage` prints a full per-runtime usage breakdown.
- CLI: `remoteclaw channels list` prints the same usage snapshot alongside runtime config (use `--no-usage` to skip).
- macOS menu bar: "Usage" section under Context (only if available).

## Runtimes

Usage data availability depends on what the CLI runtime reports:

- **Claude**: token usage and cost reported by Claude CLI output.
- **Gemini**: token usage reported by Gemini CLI output.
- **Codex**: token usage reported by Codex CLI output.
- **OpenCode**: token usage reported by OpenCode CLI output.

Usage data is only available after at least one CLI agent run has completed for the session.
