---
summary: "CLI reference for `remoteclaw tasks` (background task ledger and Task Flow state)"
read_when:
  - You want to inspect, audit, or cancel background task records
  - You are documenting Task Flow commands under `remoteclaw tasks flow`
title: "`remoteclaw tasks`"
---

Inspect durable background tasks and Task Flow state. With no subcommand,
`remoteclaw tasks` is equivalent to `remoteclaw tasks list`.

See [Background Tasks](/automation/tasks) for the lifecycle and delivery model.

## Usage

```bash
remoteclaw tasks
remoteclaw tasks list
remoteclaw tasks list --runtime acp
remoteclaw tasks list --status running
remoteclaw tasks show <lookup>
remoteclaw tasks notify <lookup> state_changes
remoteclaw tasks cancel <lookup>
remoteclaw tasks audit
remoteclaw tasks maintenance
remoteclaw tasks maintenance --apply
remoteclaw tasks flow list
remoteclaw tasks flow show <lookup>
remoteclaw tasks flow cancel <lookup>
```

## Root Options

- `--json`: output JSON.
- `--runtime <name>`: filter by kind: `subagent`, `acp`, `cron`, or `cli`.
- `--status <name>`: filter by status: `queued`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`, or `lost`.

## Subcommands

### `list`

```bash
remoteclaw tasks list [--runtime <name>] [--status <name>] [--json]
```

Lists tracked background tasks newest first.

### `show`

```bash
remoteclaw tasks show <lookup> [--json]
```

Shows one task by task ID, run ID, or session key.

### `notify`

```bash
remoteclaw tasks notify <lookup> <done_only|state_changes|silent>
```

Changes the notification policy for a running task.

### `cancel`

```bash
remoteclaw tasks cancel <lookup>
```

Cancels a running background task.

### `audit`

```bash
remoteclaw tasks audit [--severity <warn|error>] [--code <name>] [--limit <n>] [--json]
```

Surfaces stale, lost, delivery-failed, or otherwise inconsistent task and Task Flow records.

### `maintenance`

```bash
remoteclaw tasks maintenance [--apply] [--json]
```

Previews or applies task and Task Flow reconciliation, cleanup stamping, and pruning.

### `flow`

```bash
remoteclaw tasks flow list [--status <name>] [--json]
remoteclaw tasks flow show <lookup> [--json]
remoteclaw tasks flow cancel <lookup>
```

Inspects or cancels durable Task Flow state under the task ledger.

## Related

- [CLI reference](/cli)
- [Background tasks](/automation/tasks)
