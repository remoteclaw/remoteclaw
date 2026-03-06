---
summary: "CLI reference for `remoteclaw plugins` (list, install, uninstall, enable/disable, doctor)"
read_when:
  - You want to install or manage in-process Gateway plugins
  - You want to debug plugin load failures
title: "plugins"
---

# `remoteclaw plugins`

Manage Gateway plugins/extensions (loaded in-process).

Related:

- Plugin system: [Plugins](/tools/plugin)
- Plugin manifest + schema: [Plugin manifest](/plugins/manifest)
- Security hardening: [Security](/gateway/security)

## Commands

```bash
remoteclaw plugins list
remoteclaw plugins info <id>
remoteclaw plugins enable <id>
remoteclaw plugins disable <id>
remoteclaw plugins uninstall <id>
remoteclaw plugins doctor
remoteclaw plugins update <id>
remoteclaw plugins update --all
```

Bundled plugins ship with RemoteClaw but start disabled. Use `plugins enable` to
activate them.

All plugins must ship a `remoteclaw.plugin.json` file with an inline JSON Schema
(`configSchema`, even if empty). Missing/invalid manifests or schemas prevent
the plugin from loading and fail config validation.

### Install

```bash
remoteclaw plugins install <path-or-spec>
remoteclaw plugins install <npm-spec> --pin
```

Security note: treat plugin installs like running code. Prefer pinned versions.

Npm specs are **registry-only** (package name + optional version/tag). Git/URL/file
specs are rejected. Dependency installs run with `--ignore-scripts` for safety.

Supported archives: `.zip`, `.tgz`, `.tar.gz`, `.tar`.

Use `--link` to avoid copying a local directory (adds to `plugins.load.paths`):

```bash
remoteclaw plugins install -l ./my-plugin
```

Use `--pin` on npm installs to save the resolved exact spec (`name@version`) in
`plugins.installs` while keeping the default behavior unpinned.

### Uninstall

```bash
remoteclaw plugins uninstall <id>
remoteclaw plugins uninstall <id> --dry-run
remoteclaw plugins uninstall <id> --keep-files
```

`uninstall` removes plugin records from `plugins.entries`, `plugins.installs`,
the plugin allowlist, and linked `plugins.load.paths` entries when applicable.
For plugins that use exclusive slots, the slot resets to its default.

By default, uninstall also removes the plugin install directory under the active
state dir extensions root (`$REMOTECLAW_STATE_DIR/extensions/<id>`). Use
`--keep-files` to keep files on disk.

`--keep-config` is supported as a deprecated alias for `--keep-files`.

### Update

```bash
remoteclaw plugins update <id>
remoteclaw plugins update --all
remoteclaw plugins update <id> --dry-run
```

Updates only apply to plugins installed from npm (tracked in `plugins.installs`).

When a stored integrity hash exists and the fetched artifact hash changes,
RemoteClaw prints a warning and asks for confirmation before proceeding. Use
global `--yes` to bypass prompts in CI/non-interactive runs.
