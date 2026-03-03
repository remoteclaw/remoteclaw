---
summary: "CLI reference for `remoteclaw config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `remoteclaw config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `remoteclaw configure`).

## Examples

```bash
remoteclaw config get browser.executablePath
remoteclaw config set browser.executablePath "/usr/bin/google-chrome"
remoteclaw config set agents.defaults.heartbeat.every "2h"
remoteclaw config set agents.list[0].tools.exec.node "node-id-or-name"
remoteclaw config unset tools.web.search.apiKey
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

Restart the gateway after edits.
