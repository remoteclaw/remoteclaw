---
summary: "CLI reference for `remoteclaw setup` (initialize config + workspace)"
read_when:
  - You’re doing first-run setup without full CLI onboarding
  - You want to set the default workspace path
title: "setup"
---

# `remoteclaw setup`

Initialize `~/.remoteclaw/remoteclaw.json` and the agent workspace.

Related:

- Getting started: [Getting started](/start/getting-started)
- CLI onboarding: [Onboarding (CLI)](/start/wizard)

## Examples

```bash
remoteclaw setup
remoteclaw setup --workspace ~/.remoteclaw/workspace
```

To run onboarding via setup:

```bash
remoteclaw setup --wizard
```
