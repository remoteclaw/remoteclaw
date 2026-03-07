---
description: "CLI reference for `remoteclaw agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `remoteclaw agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
remoteclaw agents list
remoteclaw agents add work --workspace ~/.remoteclaw/workspace-work
remoteclaw agents set-identity --agent main --avatar avatars/remoteclaw.png
remoteclaw agents delete work
```

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Override fields explicitly:

```bash
remoteclaw agents set-identity --agent main --name "RemoteClaw" --emoji "🦀" --avatar avatars/remoteclaw.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "RemoteClaw",
          theme: "crab",
          emoji: "🦀",
          avatar: "avatars/remoteclaw.png",
        },
      },
    ],
  },
}
```
