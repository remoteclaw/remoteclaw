---
summary: "CLI reference for `remoteclaw tasks` (background task ledger and Task Flow state)"
read_when:
  - You want to inspect, audit, or cancel background task records
  - You are documenting Task Flow commands under `remoteclaw tasks flow`
title: "`remoteclaw tasks`"
---

Inspect durable background tasks and Task Flow state. With no subcommand,
`remoteclaw tasks` is equivalent to `remoteclaw tasks list`.

See [Background Tasks](/automation/tasks) for the lifecycle and delivery
model, and its `tasks audit` section for full finding descriptions.

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

| Flag               | Description                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `--json`           | Output JSON.                                                                                       |
| `--runtime <name>` | Filter by kind: `subagent`, `acp`, `cron`, or `cli`.                                               |
| `--status <name>`  | Filter by status: `queued`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`, or `lost`. |

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

Surfaces stale, lost, delivery-failed, or otherwise inconsistent task and
Task Flow records. Lost tasks retained until `cleanupAfter` are warnings;
expired or unstamped lost tasks are errors.

`--code` accepts task codes (`stale_queued`, `stale_running`, `lost`,
`delivery_failed`, `missing_cleanup`, `inconsistent_timestamps`) and Task
Flow codes (`restore_failed`, `stale_waiting`, `stale_blocked`,
`cancel_stuck`, `missing_linked_tasks`, `blocked_task_missing`). See
[Background Tasks](/automation/tasks) for severity and trigger detail per
code.

### `maintenance`

```bash
remoteclaw tasks maintenance [--apply] [--json]
```

Previews or applies task and Task Flow reconciliation, cleanup stamping,
pruning, and stale cron run session registry cleanup.

For cron tasks, reconciliation uses persisted run logs/job state before
marking an old active task `lost`, so completed cron runs do not become
false audit errors just because the in-memory Gateway runtime state is gone.
Offline CLI audit is not authoritative for the Gateway's process-local cron
active-job set. CLI tasks with a run id/source id are marked `lost` when
their live Gateway run context is gone, even if an old child-session row
remains.

When applied, maintenance also prunes `cron:<jobId>:run:<uuid>` session
registry rows older than 7 days while preserving currently running cron
jobs and leaving non-cron session rows untouched.

### `flow`

```bash
remoteclaw tasks flow list [--status <name>] [--json]
remoteclaw tasks flow show <lookup> [--json]
remoteclaw tasks flow cancel <lookup>
```

Inspects or cancels durable Task Flow state under the task ledger.
`flow list --status` accepts `queued`, `running`, `waiting`, `blocked`,
`succeeded`, `failed`, `cancelled`, or `lost`.

## Related

- [CLI reference](/cli)
- [Background tasks](/automation/tasks)
