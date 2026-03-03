---
summary: "CLI reference for `remoteclaw setup` (initialize config + workspace)"
read_when:
  - You’re doing first-run setup without the full onboarding wizard
  - You want to set the default workspace path
title: "setup"
---

# `remoteclaw setup`

Initialize `~/.remoteclaw/remoteclaw.json` and the agent workspace.

Related:

- Getting started: [Getting started](/start/getting-started)
- Configuration: [Configuration](/gateway/configuration)

## Examples

```bash
remoteclaw setup
remoteclaw setup --workspace ~/.remoteclaw/workspace
```

To run the wizard via setup:

```bash
remoteclaw setup --wizard
```
