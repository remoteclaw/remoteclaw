---
description: "CLI reference for `remoteclaw completion` (generate/install shell completion scripts)"
read_when:
  - You want shell completions for zsh/bash/fish/PowerShell
  - You need to cache completion scripts under RemoteClaw state
title: "completion"
---

# `remoteclaw completion`

Generate shell completion scripts and optionally install them into your shell profile.

## Usage

```bash
remoteclaw completion
remoteclaw completion --shell zsh
remoteclaw completion --install
remoteclaw completion --shell fish --install
remoteclaw completion --write-state
remoteclaw completion --shell bash --write-state
```

## Options

- `-s, --shell <shell>`: shell target (`zsh`, `bash`, `powershell`, `fish`; default: `zsh`)
- `-i, --install`: install completion by adding a source line to your shell profile
- `--write-state`: write completion script(s) to `$REMOTECLAW_STATE_DIR/completions` without printing to stdout
- `-y, --yes`: skip install confirmation prompts

## Notes

- `--install` writes a small "RemoteClaw Completion" block into your shell profile and points it at the cached script.
- Without `--install` or `--write-state`, the command prints the script to stdout.
- Completion generation eagerly loads command trees so nested subcommands are included.
