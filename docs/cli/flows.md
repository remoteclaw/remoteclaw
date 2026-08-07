---
summary: "Redirect: flow commands live under `remoteclaw tasks flow`"
read_when:
  - You encounter `remoteclaw flows` in older docs or release notes
  - You want a quick TaskFlow inspection reference
title: "Flows (redirect)"
---

# `remoteclaw tasks flow`

There is no top-level `remoteclaw flows` command. Durable TaskFlow inspection lives under `remoteclaw tasks flow`.

## Subcommands

```bash
remoteclaw tasks flow list   [--json] [--status <name>]
remoteclaw tasks flow show   <lookup> [--json]
remoteclaw tasks flow cancel <lookup>
```

| Subcommand | Description                | Arguments / options                                                                   |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `list`     | List tracked TaskFlows.    | `--json` machine-readable output; `--status <name>` filter (see status values below). |
| `show`     | Show one TaskFlow.         | `<lookup>` flow id or owner key; `--json` machine-readable output.                    |
| `cancel`   | Cancel a running TaskFlow. | `<lookup>` flow id or owner key.                                                      |

`<lookup>` accepts either a flow id (returned by `list` / `show`) or the flow's owner key (the stable identifier the owning subsystem uses to track the flow).

### Status filter values

`--status` on `list` accepts one of: `queued`, `running`, `waiting`, `blocked`, `succeeded`, `failed`, `cancelled`, `lost`.

## Examples

```bash
remoteclaw tasks flow list
remoteclaw tasks flow list --status running
remoteclaw tasks flow list --json
remoteclaw tasks flow show flow_abc123
remoteclaw tasks flow show flow_abc123 --json
remoteclaw tasks flow cancel flow_abc123
```

For TaskFlow concepts and authoring, see [TaskFlow](/automation/taskflow). For the parent `tasks` command, see [tasks CLI reference](/cli/tasks).

## Related

- [CLI reference](/cli)
- [Automation](/automation)
- [TaskFlow](/automation/taskflow)
