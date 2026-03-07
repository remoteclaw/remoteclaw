---
description: "CLI reference for `remoteclaw hooks` (agent hooks)"
read_when:
  - You want to manage agent hooks
  - You want to install or update hooks
title: "hooks"
---

# `remoteclaw hooks`

Manage agent hooks (event-driven automations for commands like `/new`, `/reset`, and gateway startup).

Related:

- Hooks: [Hooks](/automation/hooks)
- Plugin hooks: [Plugins](/tools/plugin#plugin-hooks)

## List All Hooks

```bash
remoteclaw hooks list
```

List all discovered hooks from workspace, managed, and bundled directories.

**Options:**

- `--eligible`: Show only eligible hooks (requirements met)
- `--json`: Output as JSON
- `-v, --verbose`: Show detailed information including missing requirements

**Example output:**

```
Hooks (2/2 ready)

Ready:
  🚀 boot ✓ - Run boot prompt on gateway startup
  📝 command-logger ✓ - Log all command events to a centralized audit file
```

**Example (verbose):**

```bash
remoteclaw hooks list --verbose
```

Shows missing requirements for ineligible hooks.

**Example (JSON):**

```bash
remoteclaw hooks list --json
```

Returns structured JSON for programmatic use.

## Get Hook Information

```bash
remoteclaw hooks info <name>
```

Show detailed information about a specific hook.

**Arguments:**

- `<name>`: Hook name (e.g., `command-logger`)

**Options:**

- `--json`: Output as JSON

**Example:**

```bash
remoteclaw hooks info command-logger
```

**Output:**

```
📝 command-logger ✓ Ready

Log all command events to a centralized audit file

Details:
  Source: remoteclaw-bundled
  Path: /path/to/remoteclaw/hooks/bundled/command-logger/HOOK.md
  Handler: /path/to/remoteclaw/hooks/bundled/command-logger/handler.ts
  Homepage: https://docs.remoteclaw.org/automation/hooks#command-logger
  Events: command
```

## Check Hooks Eligibility

```bash
remoteclaw hooks check
```

Show summary of hook eligibility status (how many are ready vs. not ready).

**Options:**

- `--json`: Output as JSON

**Example output:**

```
Hooks Status

Total hooks: 4
Ready: 4
Not ready: 0
```

## Enable a Hook

```bash
remoteclaw hooks enable <name>
```

Enable a specific hook by adding it to your config (`~/.remoteclaw/config.json`).

**Note:** Hooks managed by plugins show `plugin:<id>` in `remoteclaw hooks list` and
can’t be enabled/disabled here. Enable/disable the plugin instead.

**Arguments:**

- `<name>`: Hook name (e.g., `command-logger`)

**Example:**

```bash
remoteclaw hooks enable command-logger
```

**Output:**

```
✓ Enabled hook: 📝 command-logger
```

**What it does:**

- Checks if hook exists and is eligible
- Updates `hooks.internal.entries.<name>.enabled = true` in your config
- Saves config to disk

**After enabling:**

- Restart the gateway so hooks reload (menu bar app restart on macOS, or restart your gateway process in dev).

## Disable a Hook

```bash
remoteclaw hooks disable <name>
```

Disable a specific hook by updating your config.

**Arguments:**

- `<name>`: Hook name (e.g., `command-logger`)

**Example:**

```bash
remoteclaw hooks disable command-logger
```

**Output:**

```
⏸ Disabled hook: 📝 command-logger
```

**After disabling:**

- Restart the gateway so hooks reload

## Install Hooks

```bash
remoteclaw hooks install <path-or-spec>
remoteclaw hooks install <npm-spec> --pin
```

Install a hook pack from a local folder/archive or npm.

Npm specs are **registry-only** (package name + optional version/tag). Git/URL/file
specs are rejected. Dependency installs run with `--ignore-scripts` for safety.

**What it does:**

- Copies the hook pack into `~/.remoteclaw/hooks/<id>`
- Enables the installed hooks in `hooks.internal.entries.*`
- Records the install under `hooks.internal.installs`

**Options:**

- `-l, --link`: Link a local directory instead of copying (adds it to `hooks.internal.load.extraDirs`)
- `--pin`: Record npm installs as exact resolved `name@version` in `hooks.internal.installs`

**Supported archives:** `.zip`, `.tgz`, `.tar.gz`, `.tar`

**Examples:**

```bash
# Local directory
remoteclaw hooks install ./my-hook-pack

# Local archive
remoteclaw hooks install ./my-hook-pack.zip

# NPM package
remoteclaw hooks install @remoteclaw/my-hook-pack

# Link a local directory without copying
remoteclaw hooks install -l ./my-hook-pack
```

## Update Hooks

```bash
remoteclaw hooks update <id>
remoteclaw hooks update --all
```

Update installed hook packs (npm installs only).

**Options:**

- `--all`: Update all tracked hook packs
- `--dry-run`: Show what would change without writing

When a stored integrity hash exists and the fetched artifact hash changes,
RemoteClaw prints a warning and asks for confirmation before proceeding. Use
global `--yes` to bypass prompts in CI/non-interactive runs.

## Bundled Hooks

### ~~session-memory~~ (removed)

The session-memory hook has been removed.

### ~~bootstrap-extra-files~~ (removed)

The bootstrap-extra-files hook has been removed.

### command-logger

Logs all command events to a centralized audit file.

**Enable:**

```bash
remoteclaw hooks enable command-logger
```

**Output:** `~/.remoteclaw/logs/commands.log`

**View logs:**

```bash
# Recent commands
tail -n 20 ~/.remoteclaw/logs/commands.log

# Pretty-print
cat ~/.remoteclaw/logs/commands.log | jq .

# Filter by action
grep '"action":"new"' ~/.remoteclaw/logs/commands.log | jq .
```

**See:** [command-logger documentation](/automation/hooks#command-logger)

### boot

Runs the configured boot prompt when the gateway starts (after channels start).

**Events**: `gateway:startup`

**Enable**:

```bash
remoteclaw hooks enable boot
```

**See:** [boot documentation](/automation/hooks#boot)
