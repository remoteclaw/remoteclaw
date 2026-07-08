---
summary: "CLI reference for `remoteclaw pairing` (approve/list pairing requests)"
read_when:
  - You're using pairing-mode DMs and need to approve senders
title: "Pairing"
---

# `remoteclaw pairing`

Approve or inspect DM pairing requests (for channels that support pairing).

Related:

- Pairing flow: [Pairing](/channels/pairing)

## Commands

```bash
remoteclaw pairing list telegram
remoteclaw pairing list --channel telegram --account work
remoteclaw pairing list telegram --json

remoteclaw pairing approve <code>
remoteclaw pairing approve telegram <code>
remoteclaw pairing approve --channel telegram --account work <code> --notify
```

## `pairing list`

List pending pairing requests for one channel.

Options:

- `[channel]`: positional channel id
- `--channel <channel>`: explicit channel id
- `--account <accountId>`: account id for multi-account channels
- `--json`: machine-readable output

Notes:

- If multiple pairing-capable channels are configured, you must provide a channel either positionally or with `--channel`.
- Extension channels are allowed as long as the channel id is valid.

## `pairing approve`

Approve a pending pairing code and allow that sender.

Usage:

- `remoteclaw pairing approve <channel> <code>`
- `remoteclaw pairing approve --channel <channel> <code>`
- `remoteclaw pairing approve <code>` when exactly one pairing-capable channel is configured

Options:

- `--channel <channel>`: explicit channel id
- `--account <accountId>`: account id for multi-account channels
- `--notify`: send a confirmation back to the requester on the same channel

Owner bootstrap:

- If `commands.ownerAllowFrom` is empty when you approve a pairing code, RemoteClaw also records the approved sender as the command owner, using a channel-scoped entry such as `telegram:123456789`.
- This only bootstraps the first owner. Later pairing approvals do not replace or expand `commands.ownerAllowFrom`.
- The command owner is the human operator account allowed to run owner-only commands and approve dangerous actions such as `/diagnostics`, `/export-trajectory`, `/config`, and exec approvals.

## Notes

- Channel input: pass it positionally (`pairing list telegram`) or with `--channel <channel>`.
- `pairing list` supports `--account <accountId>` for multi-account channels.
- `pairing approve` supports `--account <accountId>` and `--notify`.
- If only one pairing-capable channel is configured, `pairing approve <code>` is allowed.
- If you approved a sender before this bootstrap existed, run `remoteclaw doctor`; it warns when no command owner is configured and shows the `remoteclaw config set commands.ownerAllowFrom ...` command to fix it.

## Related

- [CLI reference](/cli)
- [Channel pairing](/channels/pairing)
