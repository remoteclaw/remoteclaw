---
summary: "CLI reference for `remoteclaw commitments` (inspect and dismiss inferred follow-ups)"
read_when:
  - You want to inspect inferred follow-up commitments
  - You want to dismiss pending check-ins
  - You are auditing what heartbeat may deliver
title: "`remoteclaw commitments`"
---

List and manage inferred follow-up commitments.

Commitments are opt-in, short-lived follow-up memories created from
conversation context. See [Inferred commitments](/concepts/commitments) for the
conceptual guide.

With no subcommand, `remoteclaw commitments` lists pending commitments.

## Usage

```bash
remoteclaw commitments [--all] [--agent <id>] [--status <status>] [--json]
remoteclaw commitments list [--all] [--agent <id>] [--status <status>] [--json]
remoteclaw commitments dismiss <id...> [--json]
```

## Options

- `--all`: show all statuses instead of only pending commitments.
- `--agent <id>`: filter to one agent id.
- `--status <status>`: filter by status. Values: `pending`, `sent`,
  `dismissed`, `snoozed`, or `expired`.
- `--json`: output machine-readable JSON.

## Examples

List pending commitments:

```bash
remoteclaw commitments
```

List every stored commitment:

```bash
remoteclaw commitments --all
```

Filter to one agent:

```bash
remoteclaw commitments --agent main
```

Find snoozed commitments:

```bash
remoteclaw commitments --status snoozed
```

Dismiss one or more commitments:

```bash
remoteclaw commitments dismiss cm_abc123 cm_def456
```

Export as JSON:

```bash
remoteclaw commitments --all --json
```

## Output

Text output includes:

- commitment id
- status
- kind
- earliest due time
- scope
- suggested check-in text

JSON output also includes the commitment store path and full stored records.

## Related

- [Inferred commitments](/concepts/commitments)
- [Memory overview](/concepts/memory)
- [Heartbeat](/gateway/heartbeat)
- [Scheduled tasks](/automation/cron-jobs)
