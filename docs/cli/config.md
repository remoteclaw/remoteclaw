---
description: "CLI reference for `remoteclaw config` (get/set/unset/file/validate)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `remoteclaw config`

Config helpers: get/set/unset/validate values by path and print the active
config file. Run without a subcommand to open
the configure wizard (same as `remoteclaw configure`).

## Examples

```bash
remoteclaw config file
remoteclaw config get browser.executablePath
remoteclaw config set browser.executablePath "/usr/bin/google-chrome"
remoteclaw config set agents.defaults.heartbeat.every "2h"
remoteclaw config set agents.list[0].tools.exec.node "node-id-or-name"
remoteclaw config unset tools.web.search.apiKey
remoteclaw config validate
remoteclaw config validate --json
```

## Paths

Paths use dot or bracket notation:

```bash
remoteclaw config get agents.defaults.workspace
remoteclaw config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
remoteclaw config get agents.list
remoteclaw config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--strict-json` to require JSON5 parsing. `--json` remains supported as a legacy alias.

```bash
remoteclaw config set agents.defaults.heartbeat.every "0m"
remoteclaw config set gateway.port 19001 --strict-json
remoteclaw config set channels.whatsapp.groups '["*"]' --strict-json
```

## Subcommands

- `config file`: Print the active config file path (resolved from `REMOTECLAW_CONFIG_PATH` or default location).

Restart the gateway after edits.

## Validate

Validate the current config against the active schema without starting the
gateway.

```bash
remoteclaw config validate
remoteclaw config validate --json
```
