---
summary: "CLI reference for `remoteclaw tui` (Gateway-backed or local embedded terminal UI)"
read_when:
  - You want a terminal UI for the Gateway (remote-friendly)
  - You want to pass url/token/session from scripts
  - You want to run the TUI in local embedded mode without a Gateway
  - You want to use remoteclaw chat or remoteclaw tui --local
title: "TUI"
---

# `remoteclaw tui`

Open the terminal UI connected to the Gateway, or run it in local embedded
mode.

Related:

- TUI guide: [TUI](/web/tui)

Notes:

- `chat` and `terminal` are aliases for `remoteclaw tui --local`.
- `--local` cannot be combined with `--url`, `--token`, or `--password`.
- `tui` resolves configured gateway auth SecretRefs for token/password auth when possible (`env`/`file`/`exec` providers).
- When launched from inside a configured agent workspace directory, TUI auto-selects that agent for the session key default (unless `--session` is explicitly `agent:<id>:...`).
- Local mode uses the embedded agent runtime directly. Most local tools work, but Gateway-only features are unavailable.
- Local mode adds `/auth [provider]` inside the TUI command surface.
- Plugin approval gates still apply in local mode. Tools that require approval prompt for a decision in the terminal; nothing is silently auto-approved because the Gateway is not involved.

## Examples

```bash
remoteclaw chat
remoteclaw tui --local
remoteclaw tui
remoteclaw tui --url ws://127.0.0.1:18789 --token <token>
remoteclaw tui --session main --deliver
remoteclaw chat --message "Compare my config to the docs and tell me what to fix"
# when run inside an agent workspace, infers that agent automatically
remoteclaw tui --session bugfix
```

## Config repair loop

Use local mode when the current config already validates and you want the
embedded agent to inspect it, compare it against the docs, and help repair it
from the same terminal:

If `remoteclaw config validate` is already failing, use `remoteclaw configure` or
`remoteclaw doctor --fix` first. `remoteclaw chat` does not bypass the invalid-
config guard.

```bash
remoteclaw chat
```

Then inside the TUI:

```text
!remoteclaw config file
!remoteclaw docs gateway auth token secretref
!remoteclaw config validate
!remoteclaw doctor
```

Apply targeted fixes with `remoteclaw config set` or `remoteclaw configure`, then
rerun `remoteclaw config validate`. See [TUI](/web/tui) and [Config](/cli/config).

## Related

- [CLI reference](/cli)
- [TUI](/web/tui)
