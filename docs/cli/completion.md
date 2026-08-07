---
description: "CLI reference for `remoteclaw completion` (generate/install shell completion scripts)"
read_when:
  - You want shell completions for zsh/bash/fish/PowerShell
  - You need to cache completion scripts under RemoteClaw state
title: "Completion"
---

# `remoteclaw completion`

Generate shell completion scripts, cache them under RemoteClaw state, and optionally install them into your shell profile.

## Usage

```bash
remoteclaw completion                          # print zsh script to stdout
remoteclaw completion --shell fish             # print fish script
remoteclaw completion --write-state            # cache scripts for all shells
remoteclaw completion --write-state --install  # cache, then install in one step
remoteclaw completion --shell bash --write-state
```

## Options

- `-s, --shell <shell>`: shell target (`zsh`, `bash`, `powershell`, `fish`; default: `zsh`)
- `-i, --install`: install completion by adding a source line for the cached script to your shell profile
- `--write-state`: write completion script(s) to `$REMOTECLAW_STATE_DIR/completions` (default `~/.remoteclaw/completions`) without printing to stdout; with `--shell` writes only that shell, otherwise all four
- `-y, --yes`: skip install confirmation prompts (non-interactive)

## Install flow

`--install` points your profile at the cached script, so the cache must exist first: if it is missing, the command fails and tells you to run `remoteclaw completion --write-state`. Combine `--write-state --install` to do both in one step. Without `--shell`, `--install` detects the shell from `$SHELL` (falling back to zsh).

The install writes a small `# RemoteClaw Completion` block into your shell profile and replaces any older slow `source <(remoteclaw completion ...)` lines with the cached source line:

| Shell      | Profile                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| bash       | `~/.bashrc` (falls back to `~/.bash_profile` when `~/.bashrc` is missing)                                                                                                                  |
| fish       | `~/.config/fish/config.fish`                                                                                                                                                               |
| powershell | `~/.config/powershell/Microsoft.PowerShell_profile.ps1` (on Windows: `Documents/PowerShell/Microsoft.PowerShell_profile.ps1`, or `Documents/WindowsPowerShell/...` for Windows PowerShell) |
| zsh        | `~/.zshrc`                                                                                                                                                                                 |

## Notes

- Without `--install` or `--write-state`, the command prints the script to stdout.
- Completion generation eagerly loads the full command tree, including plugin CLI commands, so nested subcommands are included.
- `remoteclaw update` refreshes the completion cache automatically after a successful update; `remoteclaw doctor` can repair missing or stale completion setups.

## Related

- [CLI reference](/cli)
