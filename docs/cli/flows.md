---
summary: "Redirect: flow commands live under `remoteclaw tasks flow`"
read_when:
  - You encounter remoteclaw flows in older docs or release notes
title: "flows (redirect)"
---

# `remoteclaw tasks flow`

Flow commands are subcommands of `remoteclaw tasks`, not a standalone `flows` command.

```bash
remoteclaw tasks flow list [--json]
remoteclaw tasks flow show <lookup>
remoteclaw tasks flow cancel <lookup>
```

For full documentation see [Task Flow](/automation/taskflow) and the [tasks CLI reference](/cli/index#tasks).
