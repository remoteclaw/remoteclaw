---
summary: "Quick examples for installing, listing, uninstalling, updating, and publishing RemoteClaw plugins"
read_when:
  - You want quick plugin install, list, update, or uninstall examples
  - You want to choose between ClawHub and npm plugin distribution
  - You are publishing a plugin package
title: "Manage plugins"
sidebarTitle: "Manage plugins"
---

Most plugin workflows are a few commands: search, install, restart the Gateway,
verify, and uninstall when you no longer need the plugin.

## List plugins

```bash
remoteclaw plugins list
remoteclaw plugins list --enabled
remoteclaw plugins list --verbose
remoteclaw plugins list --json
```

Use `--json` for scripts. It includes registry diagnostics and each plugin's
static `dependencyStatus` when the plugin package declares `dependencies` or
`optionalDependencies`.

```bash
remoteclaw plugins list --json \
  | jq '.plugins[] | {id, enabled, format, source, dependencyStatus}'
```

`plugins list` is a cold inventory check. It shows what RemoteClaw can discover
from config, manifests, and the plugin registry; it does not prove that an
already-running Gateway process imported the plugin runtime.

## Install plugins

```bash
# Search ClawHub for plugin packages.
remoteclaw plugins search "calendar"

# Bare package specs try ClawHub first, then npm fallback.
remoteclaw plugins install <package>

# Force one source.
remoteclaw plugins install clawhub:<package>
remoteclaw plugins install npm:<package>

# Install a specific version or dist-tag.
remoteclaw plugins install clawhub:<package>@1.2.3
remoteclaw plugins install clawhub:<package>@beta
remoteclaw plugins install npm:@scope/remoteclaw-plugin@1.2.3
remoteclaw plugins install npm:@remoteclaw/codex

# Install from git or a local development checkout.
remoteclaw plugins install git:github.com/acme/remoteclaw-plugin@v1.0.0
remoteclaw plugins install ./my-plugin
remoteclaw plugins install --link ./my-plugin
```

After installing plugin code, restart the Gateway that serves your channels:

```bash
remoteclaw gateway restart
remoteclaw plugins inspect <plugin-id> --runtime --json
```

Use `inspect --runtime` when you need proof that the plugin registered runtime
surfaces such as tools, hooks, services, Gateway methods, or plugin-owned CLI
commands.

## Update plugins

```bash
remoteclaw plugins update <plugin-id>
remoteclaw plugins update <npm-package-or-spec>
remoteclaw plugins update --all
```

If a plugin was installed from an npm dist-tag such as `@beta`, later
`update <plugin-id>` calls reuse that recorded tag. Passing an explicit npm spec
switches the tracked install to that spec for future updates.

```bash
remoteclaw plugins update @scope/remoteclaw-plugin@beta
remoteclaw plugins update @scope/remoteclaw-plugin
```

The second command moves a plugin back to the registry's default release line
when it was previously pinned to an exact version or tag.

When `remoteclaw update` runs on the beta channel, default-line npm and ClawHub
plugin records try the matching plugin `@beta` release first. If that beta
release does not exist, RemoteClaw falls back to the recorded default/latest spec.
Exact versions and explicit tags such as `@rc` or `@beta` are preserved.

## Uninstall plugins

```bash
remoteclaw plugins uninstall <plugin-id> --dry-run
remoteclaw plugins uninstall <plugin-id>
remoteclaw plugins uninstall <plugin-id> --keep-files
remoteclaw gateway restart
```

Uninstall removes the plugin's config entry, plugin index record, allow/deny list
entries, and linked load paths when applicable. Managed install directories are
removed unless you pass `--keep-files`.

## Publish plugins

You can publish external plugins to ClawHub, npmjs.com, or
both.

### Publish to ClawHub

ClawHub is the primary public discovery surface for RemoteClaw plugins. It gives
users searchable metadata, version history, and registry scan results before
install.

```bash
npm i -g clawhub
clawhub login
clawhub package publish your-org/your-plugin --dry-run
clawhub package publish your-org/your-plugin
clawhub package publish your-org/your-plugin@v1.0.0
```

Users install from ClawHub with:

```bash
remoteclaw plugins install clawhub:<package>
remoteclaw plugins install <package>
```

The bare form still checks ClawHub first.

### Publish to npmjs.com

Native npm plugins must include a plugin manifest and `package.json` RemoteClaw
entrypoint metadata.

```json package.json
{
  "name": "@acme/remoteclaw-plugin",
  "version": "1.0.0",
  "type": "module",
  "remoteclaw": {
    "extensions": ["./dist/index.js"]
  }
}
```

```bash
npm publish --access public
```

Users install npm-only with:

```bash
remoteclaw plugins install npm:@acme/remoteclaw-plugin
remoteclaw plugins install npm:@acme/remoteclaw-plugin@beta
remoteclaw plugins install npm:@acme/remoteclaw-plugin@1.0.0
```

If the same package is also available on ClawHub, `npm:` skips ClawHub lookup and
forces npm resolution.

## Source choice

- **ClawHub**: use when you want RemoteClaw-native discovery, scan summaries,
  versions, and install hints.
- **npmjs.com**: use when you already ship JavaScript packages or need npm
  dist-tags/private registry workflows.
- **Git**: use when you want to install directly from a branch, tag, or commit.
- **Local path**: use when you are developing or testing a plugin on the same
  machine.

## Related

- [Plugins](/tools/plugin) - overview and troubleshooting
- [`remoteclaw plugins`](/cli/plugins) - full CLI reference
- [ClawHub](/tools/clawhub) - publish and registry operations
- [Building plugins](/plugins/building-plugins) - create a plugin package
- [Plugin manifest](/plugins/manifest) - manifest and package metadata
