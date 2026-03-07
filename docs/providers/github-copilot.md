---
description: "Sign in to GitHub Copilot from RemoteClaw using the device flow"
read_when:
  - You want to use GitHub Copilot as a model provider
title: "GitHub Copilot"
---

# GitHub Copilot

## What is GitHub Copilot?

GitHub Copilot is GitHub’s AI coding assistant. It provides access to Copilot
models for your GitHub account and plan. RemoteClaw can use Copilot as a model
provider in two different ways.

## Two ways to use Copilot in RemoteClaw

### 1) Built-in GitHub Copilot provider (`github-copilot`)

Use the native device-login flow to obtain a GitHub token, then exchange it for
Copilot API tokens when RemoteClaw runs. This is the **default** and simplest path
because it does not require VS Code.

### 2) Copilot Proxy plugin (`copilot-proxy`)

Use the **Copilot Proxy** VS Code extension as a local bridge. RemoteClaw talks to
the proxy’s `/v1` endpoint and uses the model list you configure there. Choose
this when you already run Copilot Proxy in VS Code or need to route through it.
You must enable the plugin and keep the VS Code extension running.

## CLI setup

```bash
remoteclaw onboard --auth-choice github-copilot
```

### Config snippet

```json5
{
  agents: { defaults: { model: { primary: "github-copilot/gpt-4o" } } },
}
```

## Notes

- Copilot model availability depends on your plan; if a model is rejected, try
  another ID (for example `github-copilot/gpt-4.1`).
- The login stores a GitHub token in the auth profile store and exchanges it for a
  Copilot API token when RemoteClaw runs.
