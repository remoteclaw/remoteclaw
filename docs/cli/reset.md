---
summary: "CLI reference for `remoteclaw reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "Reset"
---

# `remoteclaw reset`

Reset local config/state (keeps the CLI installed).

```bash
remoteclaw reset
remoteclaw reset --dry-run
remoteclaw reset --scope config --yes --non-interactive
remoteclaw reset --scope config+creds+sessions --yes --non-interactive
remoteclaw reset --scope full --yes --non-interactive
```

## Options

- `--scope <scope>`: `config`, `config+creds+sessions`, or `full`
- `--yes`: skip confirmation prompts
- `--non-interactive`: disable prompts; requires `--scope` and `--yes`
- `--dry-run`: print actions without removing files

## Scopes

| Scope                   | Removes                                                                                               | Stops gateway first |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| `config`                | config file only                                                                                      | no                  |
| `config+creds+sessions` | config file, OAuth/credentials dir, per-agent session directories                                     | yes                 |
| `full`                  | state dir (including config/creds if nested inside it) plus workspace dirs and workspace attestations | yes                 |

`config+creds+sessions` and `full` stop a running managed gateway service before deleting state.

## Notes

- Run `remoteclaw backup create` first for a restorable snapshot before removing local state.
- Without `--scope`, `remoteclaw reset` prompts interactively for the scope to remove.
- `--non-interactive` is only valid when both `--scope` and `--yes` are set.
- `config+creds+sessions` and `full` print `Next: remoteclaw onboard --install-daemon` when done.

## Related

- [CLI reference](/cli)
