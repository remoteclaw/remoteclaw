---
description: "Agent bootstrapping: workspace setup on first run"
read_when:
  - Understanding what happens on the first agent run
  - Explaining where workspace files live
  - Debugging onboarding workspace setup
title: "Agent Bootstrapping"

sidebar:
  label: "Bootstrapping"
---

# Agent Bootstrapping

Bootstrapping is the **first‑run** ritual that prepares an agent workspace. It
happens after onboarding, when the agent starts for the first time.

## What bootstrapping does

On `remoteclaw setup`, RemoteClaw creates the configured workspace directory
if it does not already exist. Agents bring their own configuration (e.g.
`CLAUDE.md` for Claude Code, `.gemini/` for Gemini CLI). RemoteClaw no longer
seeds template files in the workspace.

## Where it runs

Bootstrapping always runs on the **gateway host**. If the macOS app connects to
a remote Gateway, the workspace files live on that remote
machine.

:::note
When the Gateway runs on another machine, edit workspace files on the gateway
host (for example, `user@gateway-host:~/.remoteclaw/workspace`).
:::

## Related docs

- Configuration: [Configuration](/gateway/configuration)
- Workspace layout: [Agent workspace](/concepts/agent-workspace)
