---
summary: "CLI reference for `remoteclaw uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "uninstall"
---

# `remoteclaw uninstall`

Uninstall the gateway service + local data (CLI remains).

```bash
openclaw backup create
remoteclaw uninstall
remoteclaw uninstall --all --yes
remoteclaw uninstall --dry-run
```

Run `openclaw backup create` first if you want a restorable snapshot before removing state or workspaces.
