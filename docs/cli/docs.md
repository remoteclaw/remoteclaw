---
summary: "CLI reference for `remoteclaw docs` (search the live docs index)"
read_when:
  - You want to search the live RemoteClaw docs from the terminal
  - You need to know which helper binaries the docs CLI shells out to
title: "Docs"
---

# `remoteclaw docs`

Search the live RemoteClaw docs index from the terminal. The command shells out to the public Mintlify-hosted docs MCP search endpoint at `https://docs.remoteclaw.org/mcp.SearchRemoteClaw` and renders the results in your terminal.

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

`remoteclaw docs` invokes the `mcporter` CLI to call the docs search MCP tool, then parses the `Title: / Link: / Content:` blocks from the tool output into a list of results.

To resolve `mcporter`, RemoteClaw checks in order:

1. `mcporter` on `PATH` (used directly if present).
2. `pnpm dlx mcporter ...` if `pnpm` is installed.
3. `npx -y mcporter ...` if `npx` is installed.

If none are available, the command fails with a hint to install `pnpm` (`npm install -g pnpm`).

The search call uses a fixed 30 second timeout. Result snippets are truncated to ~220 characters per entry.

## Output

In a rich (TTY) terminal, results render as a heading followed by a bullet list. Each bullet shows the page title, the linked docs URL, and a short snippet on the next line. Empty results print "No results.".

In non-rich output (piped, `--no-color`, scripts), the same data renders as Markdown:

```markdown
# Docs search: <query>

- [Title](https://docs.remoteclaw.org/...) - snippet
- [Title](https://docs.remoteclaw.org/...) - snippet
```

## Exit codes

| Code | Meaning                                             |
| ---- | --------------------------------------------------- |
| `0`  | Search succeeded (including zero-result responses). |
| `1`  | The MCP tool call failed; stderr is printed inline. |

## Related

- [CLI reference](/cli)
- [Live docs](https://docs.remoteclaw.org)
