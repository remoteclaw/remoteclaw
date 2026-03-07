---
description: "Complete list of RemoteClaw breaking changes from OpenClaw: removed features, new capabilities, renamed config, and what stays the same."
read_when:
  - You are switching from OpenClaw to RemoteClaw
  - You want to know what features were removed or replaced
title: "RemoteClaw Breaking Changes from OpenClaw — What's Removed, Added, and Changed"
---

# What Are the Breaking Changes from OpenClaw to RemoteClaw?

RemoteClaw is a fork of OpenClaw that replaced the embedded Pi execution engine with a middleware architecture. This page lists everything that changed, was removed, or was added.

## What you lose

These OpenClaw features do not exist in RemoteClaw:

| Feature                                     | Why it was removed                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Skills system and ClawHub marketplace**   | Agents bring their own capabilities via MCP or built-in tools. There is no skills marketplace.       |
| **Model catalog (30+ LLM providers)**       | One CLI agent = one provider. Model selection is the agent's responsibility, not the gateway's.      |
| **Embedded Pi execution engine**            | Replaced by subprocess CLI agents (Claude Code, Gemini CLI, Codex CLI, OpenCode).                    |
| **Docker sandbox**                          | Agents manage their own sandboxing. RemoteClaw does not run containers for code execution.           |
| **Centralized OAuth**                       | Agents use their own API keys via environment variables. No shared OAuth flow.                       |
| **Wizard onboarding (model picker)**        | RemoteClaw's onboarding sets up channels and agent runtime — no model catalog to browse.             |
| **Web/browser/image/TTS as built-in tools** | These capabilities are either agent-native or available via MCP servers, not built into the gateway. |
| **In-process tool execution**               | Tools run inside the agent subprocess, not inside the gateway process.                               |

## What you gain

| Feature                       | What it means                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-runtime support**     | Switch between Claude Code, Gemini CLI, Codex CLI, and OpenCode via a single config key (`agentRuntime`).                         |
| **Middleware architecture**   | Lighter footprint — RemoteClaw routes messages and manages sessions; the agent does everything else.                              |
| **MCP-first tool system**     | 50 tools exposed via an MCP server injected into the agent subprocess.                                                            |
| **Subprocess isolation**      | Agent crashes don't crash the gateway. Each session runs in its own process.                                                      |
| **Agent-native capabilities** | Your CLI agent's full feature set (web search, file I/O, code execution, etc.) works without RemoteClaw needing to know about it. |

## What changed

| Area                | OpenClaw                          | RemoteClaw                                    |
| ------------------- | --------------------------------- | --------------------------------------------- |
| **State directory** | `~/.openclaw`                     | `~/.remoteclaw`                               |
| **Config file**     | `openclaw.json`                   | `remoteclaw.json`                             |
| **Env var prefix**  | `OPENCLAW_*`                      | `REMOTECLAW_*`                                |
| **CLI binary**      | `openclaw`                        | `remoteclaw`                                  |
| **Execution model** | In-process Pi engine              | CLI subprocess (claude/gemini/codex/opencode) |
| **Tool system**     | Built-in tool registry            | MCP server injected into subprocess           |
| **Model selection** | Gateway config (provider + model) | Agent config (agent chooses its own model)    |

## What stays the same

These OpenClaw features work identically in RemoteClaw:

- Channel adapters (WhatsApp, Telegram, Slack, Discord, iMessage, and 30+ more)
- Gateway WebSocket transport
- Session management and scoping
- Cron job scheduling
- Message routing and delivery
- Channel-specific formatting

## Migration

To migrate your OpenClaw installation, see [Migrate from OpenClaw](/install/from-openclaw). The `remoteclaw import` command handles config file renaming and env var rewriting automatically.
