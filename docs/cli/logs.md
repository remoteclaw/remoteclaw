---
description: "CLI reference for `remoteclaw logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `remoteclaw logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
remoteclaw logs
remoteclaw logs --follow
remoteclaw logs --json
remoteclaw logs --limit 500
remoteclaw logs --local-time
remoteclaw logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
