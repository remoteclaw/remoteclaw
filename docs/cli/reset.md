---
description: "CLI reference for `remoteclaw reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `remoteclaw reset`

Reset local config/state (keeps the CLI installed).

```bash
remoteclaw reset
remoteclaw reset --dry-run
remoteclaw reset --scope config+creds+sessions --yes --non-interactive
```
