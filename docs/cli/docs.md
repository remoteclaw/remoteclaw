---
summary: "CLI reference for `remoteclaw docs` (search the live docs index)"
read_when:
  - You want to search the live RemoteClaw docs from the terminal
title: "Docs"
---

# `remoteclaw docs`

Search the live docs index.

Arguments:

- `[query...]`: search terms to send to the live docs index

Examples:

```bash
remoteclaw docs
remoteclaw docs browser existing-session
remoteclaw docs sandbox allowHostControl
remoteclaw docs gateway token secretref
```

Notes:

- With no query, `remoteclaw docs` opens the live docs search entrypoint.
- Multi-word queries are passed through as one search request.

## Related

- [CLI reference](/cli)
