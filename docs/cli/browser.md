---
summary: "CLI reference for `remoteclaw browser` (lifecycle, profiles, tabs, actions, state, and debugging)"
read_when:
  - You use `remoteclaw browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "browser"
---

# `remoteclaw browser`

Manage RemoteClaw's browser control surface and run browser actions (lifecycle, profiles, tabs, snapshots, screenshots, navigation, input, state emulation, and debugging).

Related:

- Browser tool + API: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--expect-final`: wait for a final Gateway response.
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
remoteclaw browser profiles
remoteclaw browser --browser-profile remoteclaw start
remoteclaw browser --browser-profile remoteclaw open https://example.com
remoteclaw browser --browser-profile remoteclaw snapshot
```

## Lifecycle

```bash
remoteclaw browser status
remoteclaw browser start
remoteclaw browser stop
remoteclaw browser --browser-profile remoteclaw reset-profile
```

Notes:

- For `attachOnly` and remote CDP profiles, `remoteclaw browser stop` closes the
  active control session and clears temporary emulation overrides even when
  RemoteClaw did not launch the browser process itself.
- For local managed profiles, `remoteclaw browser stop` stops the spawned browser
  process.

## If the command is missing

If `remoteclaw browser` is an unknown command, check `plugins.allow` in
`~/.remoteclaw/remoteclaw.json`.

When `plugins.allow` is present, the bundled browser plugin must be listed
explicitly:

```json5
{
  plugins: {
    allow: ["telegram", "browser"],
  },
}
```

`browser.enabled=true` does not restore the CLI subcommand when the plugin
allowlist excludes `browser`.

Related: [Browser tool](/tools/browser#missing-browser-command-or-tool)

## Profiles

Profiles are named browser routing configs. In practice:

- `remoteclaw`: launches or attaches to a dedicated RemoteClaw-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
remoteclaw browser profiles
remoteclaw browser create-profile --name work --color "#FF5A36"
remoteclaw browser create-profile --name chrome-live --driver existing-session
remoteclaw browser create-profile --name remote --cdp-url https://browser-host.example.com
remoteclaw browser delete-profile --name work
```

Use a specific profile:

```bash
remoteclaw browser --browser-profile work tabs
```

## Tabs

```bash
remoteclaw browser tabs
remoteclaw browser tab new
remoteclaw browser tab select 2
remoteclaw browser tab close 2
remoteclaw browser open https://docs.remoteclaw.org
remoteclaw browser focus <targetId>
remoteclaw browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
remoteclaw browser snapshot
```

Screenshot:

```bash
remoteclaw browser screenshot
remoteclaw browser screenshot --full-page
remoteclaw browser screenshot --ref e12
```

Notes:

- `--full-page` is for page captures only; it cannot be combined with `--ref`
  or `--element`.
- `existing-session` / `user` profiles support page screenshots and `--ref`
  screenshots from snapshot output, but not CSS `--element` screenshots.

Navigate/click/type (ref-based UI automation):

```bash
remoteclaw browser navigate https://example.com
remoteclaw browser click <ref>
remoteclaw browser type <ref> "hello"
remoteclaw browser press Enter
remoteclaw browser hover <ref>
remoteclaw browser scrollintoview <ref>
remoteclaw browser drag <startRef> <endRef>
remoteclaw browser select <ref> OptionA OptionB
remoteclaw browser fill --fields '[{"ref":"1","value":"Ada"}]'
remoteclaw browser wait --text "Done"
remoteclaw browser evaluate --fn '(el) => el.textContent' --ref <ref>
```

File + dialog helpers:

```bash
remoteclaw browser upload /tmp/remoteclaw/uploads/file.pdf --ref <ref>
remoteclaw browser waitfordownload
remoteclaw browser download <ref> report.pdf
remoteclaw browser dialog --accept
```

## State and storage

Viewport + emulation:

```bash
remoteclaw browser resize 1280 720
remoteclaw browser set viewport 1280 720
remoteclaw browser set offline on
remoteclaw browser set media dark
remoteclaw browser set timezone Europe/London
remoteclaw browser set locale en-GB
remoteclaw browser set geo 51.5074 -0.1278 --accuracy 25
remoteclaw browser set device "iPhone 14"
remoteclaw browser set headers '{"x-test":"1"}'
remoteclaw browser set credentials myuser mypass
```

Cookies + storage:

```bash
remoteclaw browser cookies
remoteclaw browser cookies set session abc123 --url https://example.com
remoteclaw browser cookies clear
remoteclaw browser storage local get
remoteclaw browser storage local set token abc123
remoteclaw browser storage session clear
```

## Debugging

```bash
remoteclaw browser console --level error
remoteclaw browser pdf
remoteclaw browser responsebody "**/api"
remoteclaw browser highlight <ref>
remoteclaw browser errors --clear
remoteclaw browser requests --filter api
remoteclaw browser trace start
remoteclaw browser trace stop --out trace.zip
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
remoteclaw browser --browser-profile user tabs
remoteclaw browser create-profile --name chrome-live --driver existing-session
remoteclaw browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
remoteclaw browser --browser-profile chrome-live tabs
```

This path is host-only. For Docker, headless servers, Browserless, or other remote setups, use a CDP profile instead.

Current existing-session limits:

- snapshot-driven actions use refs, not CSS selectors
- `click` is left-click only
- `type` does not support `slowly=true`
- `press` does not support `delayMs`
- `hover`, `scrollintoview`, `drag`, `select`, `fill`, and `evaluate` reject
  per-call timeout overrides
- `select` supports one value only
- `wait --load networkidle` is not supported
- file uploads require `--ref` / `--input-ref`, do not support CSS
  `--element`, and currently support one file at a time
- dialog hooks do not support `--timeout`
- screenshots support page captures and `--ref`, but not CSS `--element`
- `responsebody`, download interception, PDF export, and batch actions still
  require a managed browser or raw CDP profile

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
