---
summary: "Install and use Codex, Claude, and Cursor bundles as RemoteClaw plugins"
read_when:
  - You want to install a Codex, Claude, or Cursor-compatible bundle
  - You need to understand how RemoteClaw maps bundle content into native features
  - You are debugging bundle detection or missing capabilities
title: "Plugin Bundles"
---

# Plugin Bundles

RemoteClaw can install plugins from three external ecosystems: **Codex**, **Claude**,
and **Cursor**. These are called **bundles** — content and metadata packs that
RemoteClaw maps into native features like skills, hooks, and MCP tools.

<Info>
  Bundles are **not** the same as native RemoteClaw plugins. Native plugins run
  in-process and can register any capability. Bundles are content packs with
  selective feature mapping and a narrower trust boundary.
</Info>

## Why bundles exist

Many useful plugins are published in Codex, Claude, or Cursor format. Instead
of requiring authors to rewrite them as native RemoteClaw plugins, RemoteClaw
detects these formats and maps their supported content into the native feature
set. This means you can install a Claude command pack or a Codex skill bundle
and use it immediately.

## Install a bundle

<Steps>
  <Step title="Install from a directory, archive, or marketplace">
    ```bash
    # Local directory
    remoteclaw plugins install ./my-bundle

    # Archive
    remoteclaw plugins install ./my-bundle.tgz

    # Claude marketplace
    remoteclaw plugins marketplace list <marketplace-name>
    remoteclaw plugins install <plugin-name>@<marketplace-name>
    ```

  </Step>

  <Step title="Verify detection">
    ```bash
    remoteclaw plugins list
    remoteclaw plugins inspect <id>
    ```

    Bundles show as `Format: bundle` with a subtype of `codex`, `claude`, or `cursor`.

  </Step>

  <Step title="Restart and use">
    ```bash
    remoteclaw gateway restart
    ```

    Mapped features (skills, hooks, MCP tools) are available in the next session.

  </Step>
</Steps>

## What RemoteClaw maps from bundles

Not every bundle feature runs in RemoteClaw today. Here is what works and what
is detected but not yet wired.

### Supported now

| Feature       | How it maps                                                                                          | Applies to     |
| ------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| Skill content | Bundle skill roots load as normal RemoteClaw skills                                                  | All formats    |
| Commands      | `commands/` and `.cursor/commands/` treated as skill roots                                           | Claude, Cursor |
| Hook packs    | RemoteClaw-style `HOOK.md` + `handler.ts` layouts                                                    | Codex          |
| MCP tools     | Bundle MCP config merged into embedded Pi settings; supported stdio servers launched as subprocesses | All formats    |
| Settings      | Claude `settings.json` imported as embedded Pi defaults                                              | Claude         |

### Detected but not executed

These are recognized and shown in diagnostics, but RemoteClaw does not run them:

- Claude `agents`, `hooks.json` automation, `lspServers`, `outputStyles`
- Cursor `.cursor/agents`, `.cursor/hooks.json`, `.cursor/rules`
- Codex inline/app metadata beyond capability reporting

## Bundle formats

<AccordionGroup>
  <Accordion title="Codex bundles">
    Markers: `.codex-plugin/plugin.json`

    Optional content: `skills/`, `hooks/`, `.mcp.json`, `.app.json`

    Codex bundles fit RemoteClaw best when they use skill roots and RemoteClaw-style
    hook-pack directories (`HOOK.md` + `handler.ts`).

  </Accordion>

  <Accordion title="Claude bundles">
    Two detection modes:

    - **Manifest-based:** `.claude-plugin/plugin.json`
    - **Manifestless:** default Claude layout (`skills/`, `commands/`, `agents/`, `hooks/`, `.mcp.json`, `settings.json`)

    Claude-specific behavior:

    - `commands/` is treated as skill content
    - `settings.json` is imported into embedded Pi settings (shell override keys are sanitized)
    - `.mcp.json` exposes supported stdio tools to embedded Pi
    - `hooks/hooks.json` is detected but not executed
    - Custom component paths in the manifest are additive (they extend defaults, not replace them)

  </Accordion>

  <Accordion title="Cursor bundles">
    Markers: `.cursor-plugin/plugin.json`

    Optional content: `skills/`, `.cursor/commands/`, `.cursor/agents/`, `.cursor/rules/`, `.cursor/hooks.json`, `.mcp.json`

    - `.cursor/commands/` is treated as skill content
    - `.cursor/rules/`, `.cursor/agents/`, and `.cursor/hooks.json` are detect-only

  </Accordion>
</AccordionGroup>

## Detection precedence

RemoteClaw checks for native plugin format first:

1. `remoteclaw.plugin.json` or valid `package.json` with `remoteclaw.extensions` — treated as **native plugin**
2. Bundle markers (`.codex-plugin/`, `.claude-plugin/`, or default Claude/Cursor layout) — treated as **bundle**

If a directory contains both, RemoteClaw uses the native path. This prevents
dual-format packages from being partially installed as bundles.

## Security

Bundles have a narrower trust boundary than native plugins:

- RemoteClaw does **not** load arbitrary bundle runtime modules in-process
- Skills and hook-pack paths must stay inside the plugin root (boundary-checked)
- Settings files are read with the same boundary checks
- Supported stdio MCP servers may be launched as subprocesses

This makes bundles safer by default, but you should still treat third-party
bundles as trusted content for the features they do expose.

## Troubleshooting

<AccordionGroup>
  <Accordion title="Bundle is detected but capabilities do not run">
    Run `remoteclaw plugins inspect <id>`. If a capability is listed but marked as
    not wired, that is a product limit — not a broken install.
  </Accordion>

  <Accordion title="Claude command files do not appear">
    Make sure the bundle is enabled and the markdown files are inside a detected
    `commands/` or `skills/` root.
  </Accordion>

  <Accordion title="Claude settings do not apply">
    Only embedded Pi settings from `settings.json` are supported. RemoteClaw does
    not treat bundle settings as raw config patches.
  </Accordion>

  <Accordion title="Claude hooks do not execute">
    `hooks/hooks.json` is detect-only. If you need runnable hooks, use the
    RemoteClaw hook-pack layout or ship a native plugin.
  </Accordion>
</AccordionGroup>

## Related

- [Install and Configure Plugins](/tools/plugin)
- [Building Plugins](/plugins/building-plugins) — create a native plugin
- [Plugin Manifest](/plugins/manifest) — native manifest schema
