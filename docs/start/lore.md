---
description: "RemoteClaw origin and project context"
read_when:
  - Writing docs or UX copy that reference project history
title: "About RemoteClaw"
---

# About RemoteClaw

RemoteClaw is a fork of [OpenClaw](https://github.com/openclaw/openclaw),
refocused as universal AI agent middleware.

**What stayed:** Channel adapters, gateway, messaging infrastructure.

**What changed:** The execution engine was replaced with AgentRuntime
supporting CLI-only agents (Claude, Gemini, Codex, OpenCode) instead of the
original Pi-based orchestrator.

**What was removed:** Skills marketplace, plugin system, model provider
ecosystem, consumer onboarding UX.

The project connects agent CLIs to messaging channels (WhatsApp, Telegram,
Slack, Discord, and more) without reinventing the agentic loop. Generic agent
capabilities come from each CLI's own MCP ecosystem.
