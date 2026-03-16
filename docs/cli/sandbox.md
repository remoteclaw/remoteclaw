---
title: Sandbox CLI
summary: "Manage sandbox runtimes and inspect effective sandbox policy"
read_when: "You are managing sandbox runtimes or debugging sandbox/tool-policy behavior."
status: active
---

# Sandbox CLI

Manage sandbox runtimes for isolated agent execution.

## Overview

RemoteClaw can run agents in isolated sandbox runtimes for security. The `sandbox` commands help you inspect and recreate those runtimes after updates or configuration changes.

Today that usually means:

- Docker sandbox containers
- OpenShell sandbox runtimes when `agents.defaults.sandbox.backend = "openshell"`

## Commands

### `remoteclaw sandbox explain`

Inspect the **effective** sandbox mode/scope/workspace access, sandbox tool policy, and elevated gates (with fix-it config key paths).

```bash
remoteclaw sandbox explain
remoteclaw sandbox explain --session agent:main:main
remoteclaw sandbox explain --agent work
remoteclaw sandbox explain --json
```

### `remoteclaw sandbox list`

List all sandbox runtimes with their status and configuration.

```bash
remoteclaw sandbox list
remoteclaw sandbox list --browser  # List only browser containers
remoteclaw sandbox list --json     # JSON output
```

**Output includes:**

- Runtime name and status
- Backend (`docker`, `openshell`, etc.)
- Config label and whether it matches current config
- Age (time since creation)
- Idle time (time since last use)
- Associated session/agent

### `remoteclaw sandbox recreate`

Remove sandbox runtimes to force recreation with updated config.

```bash
remoteclaw sandbox recreate --all                # Recreate all containers
remoteclaw sandbox recreate --session main       # Specific session
remoteclaw sandbox recreate --agent mybot        # Specific agent
remoteclaw sandbox recreate --browser            # Only browser containers
remoteclaw sandbox recreate --all --force        # Skip confirmation
```

**Options:**

- `--all`: Recreate all sandbox containers
- `--session <key>`: Recreate container for specific session
- `--agent <id>`: Recreate containers for specific agent
- `--browser`: Only recreate browser containers
- `--force`: Skip confirmation prompt

**Important:** Runtimes are automatically recreated when the agent is next used.

## Use Cases

### After updating a Docker image

```bash
# Pull new image
docker pull remoteclaw-sandbox:latest
docker tag remoteclaw-sandbox:latest remoteclaw-sandbox:bookworm-slim

# Update config to use new image
# Edit config: agents.defaults.sandbox.docker.image (or agents.list[].sandbox.docker.image)

# Recreate containers
remoteclaw sandbox recreate --all
```

### After changing sandbox configuration

```bash
# Edit config: agents.defaults.sandbox.* (or agents.list[].sandbox.*)

# Recreate to apply new config
remoteclaw sandbox recreate --all
```

### After changing OpenShell source, policy, or mode

```bash
# Edit config:
# - agents.defaults.sandbox.backend
# - plugins.entries.openshell.config.from
# - plugins.entries.openshell.config.mode
# - plugins.entries.openshell.config.policy

remoteclaw sandbox recreate --all
```

For OpenShell `remote` mode, recreate deletes the canonical remote workspace
for that scope. The next run seeds it again from the local workspace.

### After changing setupCommand

```bash
remoteclaw sandbox recreate --all
# or just one agent:
remoteclaw sandbox recreate --agent family
```

### For a specific agent only

```bash
# Update only one agent's containers
remoteclaw sandbox recreate --agent alfred
```

## Why is this needed?

**Problem:** When you update sandbox configuration:

- Existing runtimes continue running with old settings
- Runtimes are only pruned after 24h of inactivity
- Regularly-used agents keep old runtimes alive indefinitely

**Solution:** Use `remoteclaw sandbox recreate` to force removal of old runtimes. They'll be recreated automatically with current settings when next needed.

Tip: prefer `remoteclaw sandbox recreate` over manual backend-specific cleanup.
It uses the Gateway’s runtime registry and avoids mismatches when scope/session keys change.

## Configuration

Sandbox settings live in `~/.remoteclaw/remoteclaw.json` under `agents.defaults.sandbox` (per-agent overrides go in `agents.list[].sandbox`):

```jsonc
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all", // off, non-main, all
        "backend": "docker", // docker, openshell
        "scope": "agent", // session, agent, shared
        "docker": {
          "image": "remoteclaw-sandbox:bookworm-slim",
          "containerPrefix": "remoteclaw-sbx-",
          // ... more Docker options
        },
        "prune": {
          "idleHours": 24, // Auto-prune after 24h idle
          "maxAgeDays": 7, // Auto-prune after 7 days
        },
      },
    },
  },
}
```

## See Also

- [Sandbox Documentation](/gateway/sandboxing)
- [Agent Configuration](/concepts/agent-workspace)
- [Doctor Command](/gateway/doctor) - Check sandbox setup
