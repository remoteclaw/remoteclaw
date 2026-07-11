---
summary: "CLI reference for `remoteclaw docs` (search the live docs index)"
read_when:
  - You want to search the live RemoteClaw docs from the terminal
  - You need to know which hosted search API the docs CLI calls
title: "Docs"
---

# `remoteclaw docs`

Search the live RemoteClaw docs index from the terminal. The command calls RemoteClaw's Cloudflare-hosted docs search API and renders the results in your terminal.

## Usage

```bash
remoteclaw docs                       # print docs entrypoint and example search
remoteclaw docs <query...>            # search the live docs index
```

Arguments:

| Argument     | Description                                                                        |
| ------------ | ---------------------------------------------------------------------------------- |
| `[query...]` | Free-form search query. Multi-word queries are joined with spaces and sent as one. |

## Examples

```bash
remoteclaw docs browser existing-session
remoteclaw docs sandbox allowHostControl
remoteclaw docs gateway token secretref
```

With no query, `remoteclaw docs` prints the docs entrypoint URL plus a sample search command instead of running a search.

## How it works

`remoteclaw docs` calls `https://docs.remoteclaw.org/api/search` and renders the JSON results. The search call uses a fixed 30 second timeout.

## Output

In a rich (TTY) terminal, results render as a heading followed by a bullet list. Each bullet shows the page title, the linked docs URL, and a short snippet on the next line. Empty results print "No results.".

In non-rich output (piped, `--no-color`, scripts), the same data renders as Markdown:

```markdown
# Docs search: <query>

- [Title](https://docs.remoteclaw.org/...) - snippet
- [Title](https://docs.remoteclaw.org/...) - snippet
```

## Exit codes

| Code | Meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| `0`  | Search succeeded (including zero-result responses).               |
| `1`  | The hosted docs search API call failed; stderr is printed inline. |

## Related

- [CLI reference](/cli)
- [Live docs](https://docs.remoteclaw.org)
