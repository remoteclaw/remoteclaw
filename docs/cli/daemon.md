---
description: "CLI reference for `remoteclaw daemon` (legacy alias for gateway service management)"
read_when:
  - You still use `remoteclaw daemon ...` in scripts
  - You need service lifecycle commands (install/start/stop/restart/status)
title: "daemon"
---

# `remoteclaw daemon`

Legacy alias for Gateway service management commands.

`remoteclaw daemon ...` maps to the same service control surface as `remoteclaw gateway ...` service commands.

## Usage

```bash
remoteclaw daemon status
remoteclaw daemon install
remoteclaw daemon start
remoteclaw daemon stop
remoteclaw daemon restart
remoteclaw daemon uninstall
```

## Subcommands

- `status`: show service install state and probe Gateway health
- `install`: install service (`launchd`/`systemd`/`schtasks`)
- `uninstall`: remove service
- `start`: start service
- `stop`: stop service
- `restart`: restart service

## Common options

- `status`: `--url`, `--token`, `--password`, `--timeout`, `--no-probe`, `--deep`, `--json`
- `install`: `--port`, `--runtime <node|bun>`, `--token`, `--force`, `--json`
- lifecycle (`uninstall|start|stop|restart`): `--json`

## Prefer

Use [`remoteclaw gateway`](/cli/gateway) for current docs and examples.
