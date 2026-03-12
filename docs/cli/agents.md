---
description: "CLI reference for `remoteclaw agents` (list/add/delete/bindings/bind/unbind/set identity)"
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
remoteclaw agents bindings
remoteclaw agents bind --agent work --bind telegram:ops
remoteclaw agents unbind --agent work --bind telegram:ops
remoteclaw agents set-identity --agent main --avatar avatars/remoteclaw.png
remoteclaw agents delete work
```

## Routing bindings

Use routing bindings to pin inbound channel traffic to a specific agent.

List bindings:

```bash
remoteclaw agents bindings
remoteclaw agents bindings --agent work
remoteclaw agents bindings --json
```

Add bindings:

```bash
remoteclaw agents bind --agent work --bind telegram:ops --bind discord:guild-a
```

If you omit `accountId` (`--bind <channel>`), RemoteClaw resolves it from channel defaults and plugin setup hooks when available.

### Binding scope behavior

- A binding without `accountId` matches the channel default account only.
- `accountId: "*"` is the channel-wide fallback (all accounts) and is less specific than an explicit account binding.
- If the same agent already has a matching channel binding without `accountId`, and you later bind with an explicit or resolved `accountId`, RemoteClaw upgrades that existing binding in place instead of adding a duplicate.

Example:

```bash
# initial channel-only binding
remoteclaw agents bind --agent work --bind telegram

# later upgrade to account-scoped binding
remoteclaw agents bind --agent work --bind telegram:ops
```

After the upgrade, routing for that binding is scoped to `telegram:ops`. If you also want default-account routing, add it explicitly (for example `--bind telegram:default`).

Remove bindings:

```bash
remoteclaw agents unbind --agent work --bind telegram:ops
remoteclaw agents unbind --agent work --all
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
