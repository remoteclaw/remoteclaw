---
summary: "RemoteClaw plugins/extensions: discovery, config, and safety"
read_when:
  - Adding or modifying plugins/extensions
  - Documenting plugin install or load rules
  - Working with Codex/Claude-compatible plugin bundles
title: "Plugins"
---

# Plugins (Extensions)

## Quick start

A plugin is either:

- a native **RemoteClaw plugin** (`remoteclaw.plugin.json` + runtime module), or
- a compatible **bundle** (`.codex-plugin/plugin.json` or `.claude-plugin/plugin.json`)

Both show up under `remoteclaw plugins`, but only native RemoteClaw plugins execute
runtime code in-process.

1. See what is already loaded:

```bash
remoteclaw plugins list
```

2. Install an official plugin (example: Voice Call):

```bash
remoteclaw plugins install @remoteclaw/voice-call
```

Npm specs are registry-only. See [install rules](/cli/plugins#install) for
details on pinning, prerelease gating, and supported spec formats.

3. Restart the Gateway, then configure under `plugins.entries.<id>.config`.

See [Voice Call](/plugins/voice-call) for a concrete example plugin.
Looking for third-party listings? See [Community plugins](/plugins/community).
Need the bundle compatibility details? See [Plugin bundles](/plugins/bundles).

For compatible bundles, install from a local directory or archive:

```bash
remoteclaw plugins install ./my-bundle
remoteclaw plugins install ./my-bundle.tgz
```

For Claude marketplace installs, list the marketplace first, then install by
marketplace entry name:

```bash
remoteclaw plugins marketplace list <marketplace-name>
remoteclaw plugins install <plugin-name>@<marketplace-name>
```

RemoteClaw resolves known Claude marketplace names from
`~/.claude/plugins/known_marketplaces.json`. You can also pass an explicit
marketplace source with `--marketplace`.

## Available plugins (official)

### Installable plugins

These are published to npm and installed with `remoteclaw plugins install`:

| Plugin          | Package                  | Docs                                 |
| --------------- | ------------------------ | ------------------------------------ |
| Matrix          | `@remoteclaw/matrix`     | [Matrix](/channels/matrix)           |
| Microsoft Teams | `@remoteclaw/msteams`    | [Microsoft Teams](/channels/msteams) |
| Nostr           | `@remoteclaw/nostr`      | [Nostr](/channels/nostr)             |
| Voice Call      | `@remoteclaw/voice-call` | [Voice Call](/plugins/voice-call)    |
| Zalo            | `@remoteclaw/zalo`       | [Zalo](/channels/zalo)               |
| Zalo Personal   | `@remoteclaw/zalouser`   | [Zalo Personal](/plugins/zalouser)   |

Microsoft Teams is plugin-only as of 2026.1.15.

Packaged installs also ship install-on-demand metadata for heavyweight official
plugins. Today that includes WhatsApp and `memory-lancedb`: onboarding,
`remoteclaw channels add`, `remoteclaw channels login --channel whatsapp`, and
other channel setup flows prompt to install them when first used instead of
shipping their full runtime trees inside the main npm tarball.

### Bundled plugins

These ship with RemoteClaw and are enabled by default unless noted.

**Memory:**

- `memory-core` -- bundled memory search (default via `plugins.slots.memory`)
- `memory-lancedb` -- install-on-demand long-term memory with auto-recall/capture (set `plugins.slots.memory = "memory-lancedb"`)

**Model providers** (all enabled by default):

`anthropic`, `byteplus`, `cloudflare-ai-gateway`, `github-copilot`, `google`, `huggingface`, `kilocode`, `kimi-coding`, `minimax`, `mistral`, `modelstudio`, `moonshot`, `nvidia`, `openai`, `opencode`, `opencode-go`, `openrouter`, `qianfan`, `qwen-portal-auth`, `synthetic`, `together`, `venice`, `vercel-ai-gateway`, `volcengine`, `xiaomi`, `zai`

**Speech providers** (enabled by default):

`elevenlabs`, `microsoft`

**Other bundled:**

- `copilot-proxy` -- VS Code Copilot Proxy bridge (disabled by default)

## Compatible bundles

RemoteClaw also recognizes compatible external bundle layouts:

- Codex-style bundles: `.codex-plugin/plugin.json`
- Claude-style bundles: `.claude-plugin/plugin.json` or the default Claude
  component layout without a manifest
- Cursor-style bundles: `.cursor-plugin/plugin.json`

They are shown in the plugin list as `format=bundle`, with a subtype of
`codex`, `claude`, or `cursor` in verbose/inspect output.

See [Plugin bundles](/plugins/bundles) for the exact detection rules, mapping
behavior, and current support matrix.

## Config

```json5
{
  plugins: {
    enabled: true,
    allow: ["voice-call"],
    deny: ["untrusted-plugin"],
    load: { paths: ["~/Projects/oss/voice-call-extension"] },
    entries: {
      "voice-call": { enabled: true, config: { provider: "twilio" } },
    },
  },
}
```

Fields:

- `enabled`: master toggle (default: true)
- `allow`: allowlist (optional)
- `deny`: denylist (optional; deny wins)
- `load.paths`: extra plugin files/dirs
- `slots`: exclusive slot selectors such as `memory` and `contextEngine`
- `entries.<id>`: per-plugin toggles + config

Config changes **require a gateway restart**. See
[Configuration reference](/configuration) for the full config schema.

Validation rules (strict):

- Unknown plugin ids in `entries`, `allow`, `deny`, or `slots` are **errors**.
- Unknown `channels.<id>` keys are **errors** unless a plugin manifest declares
  the channel id.
- Native plugin config is validated using the JSON Schema embedded in
  `remoteclaw.plugin.json` (`configSchema`).
- Compatible bundles currently do not expose native RemoteClaw config schemas.
- If a plugin is disabled, its config is preserved and a **warning** is emitted.

### Disabled vs missing vs invalid

These states are intentionally different:

- **disabled**: plugin exists, but enablement rules turned it off
- **missing**: config references a plugin id that discovery did not find
- **invalid**: plugin exists, but its config does not match the declared schema

RemoteClaw preserves config for disabled plugins so toggling them back on is not
destructive.

## Discovery and precedence

RemoteClaw scans, in order:

1. Config paths

- `plugins.load.paths` (file or directory)

2. Workspace extensions

- `<workspace>/.remoteclaw/extensions/*.ts`
- `<workspace>/.remoteclaw/extensions/*/index.ts`

3. Global extensions

- `~/.remoteclaw/extensions/*.ts`
- `~/.remoteclaw/extensions/*/index.ts`

4. Bundled extensions (shipped with RemoteClaw; mixed default-on/default-off)

- `<remoteclaw>/dist/extensions/*` in packaged installs
- `<workspace>/dist-runtime/extensions/*` in local built checkouts
- `<workspace>/extensions/*` in source/Vitest workflows

Many bundled provider plugins are enabled by default so model catalogs/runtime
hooks stay available without extra setup. Others still require explicit
enablement via `plugins.entries.<id>.enabled` or
`remoteclaw plugins enable <id>`.

Bundled plugin runtime dependencies are owned by each plugin package. Packaged
builds stage opted-in bundled dependencies under
`dist/extensions/<id>/node_modules` instead of requiring mirrored copies in the
root package. Very large official plugins can ship as metadata-only bundled
entries and install their runtime package on demand. npm artifacts ship the
built `dist/extensions/*` tree; source `extensions/*` directories stay in source
checkouts only.

Installed plugins are enabled by default, but can be disabled the same way.

Workspace plugins are **disabled by default** unless you explicitly enable them
or allowlist them. This is intentional: a checked-out repo should not silently
become production gateway code.

If multiple plugins resolve to the same id, the first match in the order above
wins and lower-precedence copies are ignored.

### Enablement rules

Enablement is resolved after discovery:

- `plugins.enabled: false` disables all plugins
- `plugins.deny` always wins
- `plugins.entries.<id>.enabled: false` disables that plugin
- workspace-origin plugins are disabled by default
- allowlists restrict the active set when `plugins.allow` is non-empty
- allowlists are **id-based**, not source-based
- bundled plugins are disabled by default unless:
  - the bundled id is in the built-in default-on set, or
  - you explicitly enable it, or
  - channel config implicitly enables the bundled channel plugin
- exclusive slots can force-enable the selected plugin for that slot

## Plugin slots (exclusive categories)

Some plugin categories are **exclusive** (only one active at a time). Use
`plugins.slots` to select which plugin owns the slot:

```json5
{
  plugins: {
    slots: {
      memory: "memory-core", // or "none" to disable memory plugins
      contextEngine: "legacy", // or a plugin id such as "lossless-claw"
    },
  },
}
```

Supported exclusive slots:

- `memory`: active memory plugin (`"none"` disables memory plugins)
- `contextEngine`: active context engine plugin (`"legacy"` is the built-in default)

If multiple plugins declare `kind: "memory"` or `kind: "context-engine"`, only
the selected plugin loads for that slot. Others are disabled with diagnostics.
Declare `kind` in your [plugin manifest](/plugins/manifest).

## Plugin IDs

Default plugin ids:

- Package packs: `package.json` `name`
- Standalone file: file base name (`~/.../voice-call.ts` -> `voice-call`)

If a plugin exports `id`, RemoteClaw uses it but warns when it does not match the
configured id.

## Inspection

```bash
remoteclaw plugins inspect openai        # deep detail on one plugin
remoteclaw plugins inspect openai --json # machine-readable
remoteclaw plugins list                  # compact inventory
remoteclaw plugins status                # operational summary
remoteclaw plugins doctor                # issue-focused diagnostics
```

## CLI

```bash
remoteclaw plugins list
remoteclaw plugins inspect <id>
remoteclaw plugins install <path>                 # copy a local file/dir into ~/.remoteclaw/extensions/<id>
remoteclaw plugins install ./extensions/voice-call # relative path ok
remoteclaw plugins install ./plugin.tgz           # install from a local tarball
remoteclaw plugins install ./plugin.zip           # install from a local zip
remoteclaw plugins install -l ./extensions/voice-call # link (no copy) for dev
remoteclaw plugins install @remoteclaw/voice-call   # install from npm
remoteclaw plugins install @remoteclaw/voice-call --pin # store exact resolved name@version
remoteclaw plugins update <id-or-npm-spec>
remoteclaw plugins update --all
remoteclaw plugins enable <id>
remoteclaw plugins disable <id>
remoteclaw plugins doctor
```

See [`remoteclaw plugins` CLI reference](/cli/plugins) for full details on each
command (install rules, inspect output, marketplace installs, uninstall).

Plugins may also register their own top-level commands (example:
`remoteclaw voicecall`).

## Plugin API (overview)

Plugins export either:

- A function: `(api) => { ... }`
- An object: `{ id, name, configSchema, register(api) { ... } }`

`register(api)` is where plugins attach behavior. Common registrations include:

- `registerTool`
- `registerHook`
- `on(...)` for typed lifecycle hooks
- `registerChannel`
- `registerProvider`
- `registerSpeechProvider`
- `registerMediaUnderstandingProvider`
- `registerWebSearchProvider`
- `registerHttpRoute`
- `registerCommand`
- `registerCli`
- `registerContextEngine`
- `registerService`

See [Plugin manifest](/plugins/manifest) for the manifest file format.

## Further reading

- [Plugin architecture and internals](/plugins/architecture) -- capability model,
  ownership model, contracts, load pipeline, runtime helpers, and developer API
  reference
- [Building extensions](/plugins/building-extensions)
- [Plugin bundles](/plugins/bundles)
- [Plugin manifest](/plugins/manifest)
- [Plugin agent tools](/plugins/agent-tools)
- [Capability Cookbook](/tools/capability-cookbook)
- [Community plugins](/plugins/community)
