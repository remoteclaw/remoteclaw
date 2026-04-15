---
summary: "CLI reference for `remoteclaw reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `remoteclaw reset`

Reset local config/state (keeps the CLI installed).

```bash
openclaw backup create
remoteclaw reset
remoteclaw reset --dry-run
remoteclaw reset --scope config+creds+sessions --yes --non-interactive
```

Run `openclaw backup create` first if you want a restorable snapshot before removing local state.
