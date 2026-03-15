---
summary: "Unified bundle format guide for Codex, Claude, and Cursor bundles in RemoteClaw"
read_when:
  - You want to install or debug a Codex, Claude, or Cursor-compatible bundle
  - You need to understand how RemoteClaw maps bundle content into native features
  - You are documenting bundle compatibility or current support limits
title: "Plugin Bundles"
---

# Plugin bundles

RemoteClaw supports one shared class of external plugin package: **bundle
plugins**.

Today that means three closely related ecosystems:

- Codex bundles
- Claude bundles
- Cursor bundles

RemoteClaw shows all of them as `Format: bundle` in `remoteclaw plugins list`.
Verbose output and `remoteclaw plugins info <id>` also show the subtype
(`codex`, `claude`, or `cursor`).

Related:

- Plugin system overview: [Plugins](/tools/plugin)
- CLI install/list flows: [plugins](/cli/plugins)
- Native manifest schema: [Plugin manifest](/plugins/manifest)

## What a bundle is

A bundle is a **content/metadata pack**, not a native in-process RemoteClaw
plugin.

Today, RemoteClaw does **not** execute bundle runtime code in-process. Instead,
it detects known bundle files, reads the metadata, and maps supported bundle
content into native RemoteClaw surfaces such as skills, hook packs, MCP config,
and embedded Pi settings.

That is the main trust boundary:

- native RemoteClaw plugin: runtime module executes in-process
- bundle: metadata/content pack, with selective feature mapping

## Shared bundle model

Codex, Claude, and Cursor bundles are similar enough that RemoteClaw treats them
as one normalized model.

Shared idea:

- a small manifest file, or a default directory layout
- one or more content roots such as `skills/` or `commands/`
- optional tool/runtime metadata such as MCP, hooks, agents, or LSP
- install as a directory or archive, then enable in the normal plugin list

Common RemoteClaw behavior:

- detect the bundle subtype
- normalize it into one internal bundle record
- map supported parts into native RemoteClaw features
- report unsupported parts as detected-but-not-wired capabilities

In practice, most users do not need to think about the vendor-specific format
first. The more useful question is: which bundle surfaces does RemoteClaw map
today?

## Detection order

RemoteClaw prefers native RemoteClaw plugin/package layouts before bundle handling.

Practical effect:

- `remoteclaw.plugin.json` wins over bundle detection
- package installs with valid `package.json` + `remoteclaw.extensions` use the
  native install path
- if a directory contains both native and bundle metadata, RemoteClaw treats it
  as native first

That avoids partially installing a dual-format package as a bundle and then
loading it later as a native plugin.

## What works today

RemoteClaw normalizes bundle metadata into one internal bundle record, then maps
supported surfaces into existing native behavior.

### Supported now

#### Skill content

- bundle skill roots load as normal RemoteClaw skill roots
- Claude `commands` roots are treated as additional skill roots
- Cursor `.cursor/commands` roots are treated as additional skill roots

This means Claude markdown command files work through the normal RemoteClaw skill
loader. Cursor command markdown works through the same path.

#### Hook packs

- bundle hook roots work **only** when they use the normal RemoteClaw hook-pack
  layout. Today this is primarily the Codex-compatible case:
  - `HOOK.md`
  - `handler.ts` or `handler.js`

#### MCP for CLI backends

- enabled bundles can contribute MCP server config
- current runtime wiring is used by the `claude-cli` backend
- RemoteClaw merges bundle MCP config into the backend `--mcp-config` file

#### Embedded Pi settings

- Claude `settings.json` is imported as default embedded Pi settings when the
  bundle is enabled
- RemoteClaw sanitizes shell override keys before applying them

Sanitized keys:

- `shellPath`
- `shellCommandPrefix`

### Detected but not executed

These surfaces are detected, shown in bundle capabilities, and may appear in
diagnostics/info output, but RemoteClaw does not run them yet:

- Claude `agents`
- Claude `hooks.json` automation
- Claude `lspServers`
- Claude `outputStyles`
- Cursor `.cursor/agents`
- Cursor `.cursor/hooks.json`
- Cursor `.cursor/rules`
- Cursor `mcpServers` outside the current mapped runtime paths
- Codex inline/app metadata beyond capability reporting

## Capability reporting

`remoteclaw plugins info <id>` shows bundle capabilities from the normalized
bundle record.

Supported capabilities are loaded quietly. Unsupported capabilities produce a
warning such as:

```text
bundle capability detected but not wired into RemoteClaw yet: agents
```

Current exceptions:

- Claude `commands` is considered supported because it maps to skills
- Claude `settings` is considered supported because it maps to embedded Pi settings
- Cursor `commands` is considered supported because it maps to skills
- bundle MCP is considered supported where RemoteClaw actually imports it
- Codex `hooks` is considered supported only for RemoteClaw hook-pack layouts

## Format differences

The formats are close, but not byte-for-byte identical. These are the practical
differences that matter in RemoteClaw.

### Codex

Typical markers:

- `.codex-plugin/plugin.json`
- optional `skills/`
- optional `hooks/`
- optional `.mcp.json`
- optional `.app.json`

Codex bundles fit RemoteClaw best when they use skill roots and RemoteClaw-style
hook-pack directories.

### Claude

RemoteClaw supports both:

- manifest-based Claude bundles: `.claude-plugin/plugin.json`
- manifestless Claude bundles that use the default Claude layout

Default Claude layout markers RemoteClaw recognizes:

- `skills/`
- `commands/`
- `agents/`
- `hooks/hooks.json`
- `.mcp.json`
- `.lsp.json`
- `settings.json`

Claude-specific notes:

- `commands/` is treated like skill content
- `settings.json` is imported into embedded Pi settings
- `hooks/hooks.json` is detected, but not executed as Claude automation

### Cursor

Typical markers:

- `.cursor-plugin/plugin.json`
- optional `skills/`
- optional `.cursor/commands/`
- optional `.cursor/agents/`
- optional `.cursor/rules/`
- optional `.cursor/hooks.json`
- optional `.mcp.json`

Cursor-specific notes:

- `.cursor/commands/` is treated like skill content
- `.cursor/rules/`, `.cursor/agents/`, and `.cursor/hooks.json` are
  detect-only today

## Claude custom paths

Claude bundle manifests can declare custom component paths. RemoteClaw treats
those paths as **additive**, not replacing defaults.

Currently recognized custom path keys:

- `skills`
- `commands`
- `agents`
- `hooks`
- `mcpServers`
- `lspServers`
- `outputStyles`

Examples:

- default `commands/` plus manifest `commands: "extra-commands"` =>
  RemoteClaw scans both
- default `skills/` plus manifest `skills: ["team-skills"]` =>
  RemoteClaw scans both

## Security model

Bundle support is intentionally narrower than native plugin support.

Current behavior:

- bundle discovery reads files inside the plugin root with boundary checks
- skills and hook-pack paths must stay inside the plugin root
- bundle settings files are read with the same boundary checks
- RemoteClaw does not execute arbitrary bundle runtime code in-process

This makes bundle support safer by default than native plugin modules, but you
should still treat third-party bundles as trusted content for the features they
do expose.

## Install examples

```bash
remoteclaw plugins install ./my-codex-bundle
remoteclaw plugins install ./my-claude-bundle
remoteclaw plugins install ./my-cursor-bundle
remoteclaw plugins install ./my-bundle.tgz
remoteclaw plugins info my-bundle
```

If the directory is a native RemoteClaw plugin/package, the native install path
still wins.

## Troubleshooting

### Bundle is detected but capabilities do not run

Check `remoteclaw plugins info <id>`.

If the capability is listed but RemoteClaw says it is not wired yet, that is a
real product limit, not a broken install.

### Claude command files do not appear

Make sure the bundle is enabled and the markdown files are inside a detected
`commands` root or `skills` root.

### Claude settings do not apply

Current support is limited to embedded Pi settings from `settings.json`.
RemoteClaw does not treat bundle settings as raw RemoteClaw config patches.

### Claude hooks do not execute

`hooks/hooks.json` is only detected today.

If you need runnable bundle hooks today, use the normal RemoteClaw hook-pack
layout through a supported Codex hook root or ship a native RemoteClaw plugin.
