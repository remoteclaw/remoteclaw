---
summary: "Generated inventory of RemoteClaw plugins shipped in core, published externally, or kept source-only"
read_when:
  - You are deciding whether a plugin ships in the core npm package or installs separately
  - You are updating bundled plugin package metadata or release automation
  - You need the canonical internal vs external plugin list
title: "Plugin inventory"
---

# Plugin inventory

This page is generated from `extensions/*/package.json`, `remoteclaw.plugin.json`,
and the root npm package `files` exclusions. Regenerate it with:

```bash
pnpm plugins:inventory:gen
```

## Definitions

- **Core npm package:** built into the `remoteclaw` npm package and available without a separate plugin install.
- **Official external package:** RemoteClaw-maintained plugin omitted from the core npm package, kept in this official inventory, and installed on demand through ClawHub and/or npm.
- **Source checkout only:** repo-local plugin omitted from published npm artifacts and not advertised as an installable package.

Source checkouts are different from npm installs: after `pnpm install`, bundled
plugins load from `extensions/<id>` so local edits and package-local workspace
dependencies are available.

## Install a plugin

Every plugin in this inventory ships inside the `remoteclaw` npm package, so no
separate plugin install is required — each entry's install route reads
`included in RemoteClaw`. Restart the Gateway and inspect a plugin to confirm it
loaded:

```bash
remoteclaw gateway restart
remoteclaw plugins inspect discord --runtime --json
```

Follow the plugin's setup doc, such as [Discord](/channels/discord), to add
credentials and channel config. See [Manage plugins](/plugins/manage-plugins) for
update, uninstall, and publishing commands.

Each entry lists the package, distribution route, and description.

## Core npm package

27 plugins

- **[bluebubbles](/plugins/reference/bluebubbles)** (`@remoteclaw/bluebubbles`) - included in RemoteClaw. Adds the Bluebubbles channel surface for sending and receiving RemoteClaw messages.

- **[clickclack](/plugins/reference/clickclack)** (`@remoteclaw/clickclack`) - included in RemoteClaw. Adds the Clickclack channel surface for sending and receiving RemoteClaw messages.

- **[diagnostics-otel](/plugins/reference/diagnostics-otel)** (`@remoteclaw/diagnostics-otel`) - included in RemoteClaw; npm; ClawHub. RemoteClaw diagnostics OpenTelemetry exporter for metrics, traces, and logs.

- **[diagnostics-prometheus](/plugins/reference/diagnostics-prometheus)** (`@remoteclaw/diagnostics-prometheus`) - included in RemoteClaw; npm; ClawHub. RemoteClaw diagnostics Prometheus exporter for runtime metrics.

- **[discord](/plugins/reference/discord)** (`@remoteclaw/discord`) - included in RemoteClaw. Adds the Discord channel surface for sending and receiving RemoteClaw messages.

- **[feishu](/plugins/reference/feishu)** (`@remoteclaw/feishu`) - included in RemoteClaw. Adds the Feishu channel surface for sending and receiving RemoteClaw messages.

- **[googlechat](/plugins/reference/googlechat)** (`@remoteclaw/googlechat`) - included in RemoteClaw. Adds the Google Chat channel surface for sending and receiving RemoteClaw messages.

- **[imessage](/plugins/reference/imessage)** (`@remoteclaw/imessage`) - included in RemoteClaw. Adds the iMessage channel surface for sending and receiving RemoteClaw messages.

- **[irc](/plugins/reference/irc)** (`@remoteclaw/irc`) - included in RemoteClaw. Adds the IRC channel surface for sending and receiving RemoteClaw messages.

- **[line](/plugins/reference/line)** (`@remoteclaw/line`) - included in RemoteClaw. Adds the LINE channel surface for sending and receiving RemoteClaw messages.

- **[matrix](/plugins/reference/matrix)** (`@remoteclaw/matrix`) - included in RemoteClaw. Adds the Matrix channel surface for sending and receiving RemoteClaw messages.

- **[mattermost](/plugins/reference/mattermost)** (`@remoteclaw/mattermost`) - included in RemoteClaw. Adds the Mattermost channel surface for sending and receiving RemoteClaw messages.

- **[msteams](/plugins/reference/msteams)** (`@remoteclaw/msteams`) - included in RemoteClaw. Adds the Microsoft Teams channel surface for sending and receiving RemoteClaw messages.

- **[nextcloud-talk](/plugins/reference/nextcloud-talk)** (`@remoteclaw/nextcloud-talk`) - included in RemoteClaw. Adds the Nextcloud Talk channel surface for sending and receiving RemoteClaw messages.

- **[nostr](/plugins/reference/nostr)** (`@remoteclaw/nostr`) - included in RemoteClaw. Adds the Nostr channel surface for sending and receiving RemoteClaw messages.

- **[policy](/plugins/reference/policy)** (`@remoteclaw/policy`) - included in RemoteClaw. Adds policy-backed doctor checks for workspace conformance.

- **[signal](/plugins/reference/signal)** (`@remoteclaw/signal`) - included in RemoteClaw. Adds the Signal channel surface for sending and receiving RemoteClaw messages.

- **[slack](/plugins/reference/slack)** (`@remoteclaw/slack`) - included in RemoteClaw. Adds the Slack channel surface for sending and receiving RemoteClaw messages.

- **[sms](/plugins/reference/sms)** (`@remoteclaw/sms`) - included in RemoteClaw. Adds the Sms channel surface for sending and receiving RemoteClaw messages.

- **[synology-chat](/plugins/reference/synology-chat)** (`@remoteclaw/synology-chat`) - included in RemoteClaw. Adds the Synology Chat channel surface for sending and receiving RemoteClaw messages.

- **[telegram](/plugins/reference/telegram)** (`@remoteclaw/telegram`) - included in RemoteClaw. Adds the Telegram channel surface for sending and receiving RemoteClaw messages.

- **[tlon](/plugins/reference/tlon)** (`@remoteclaw/tlon`) - included in RemoteClaw. Adds the Tlon channel surface for sending and receiving RemoteClaw messages.

- **[twitch](/plugins/reference/twitch)** (`@remoteclaw/twitch`) - included in RemoteClaw. Adds the Twitch channel surface for sending and receiving RemoteClaw messages.

- **[voice-call](/plugins/reference/voice-call)** (`@remoteclaw/voice-call`) - included in RemoteClaw. RemoteClaw voice-call plugin.

- **[whatsapp](/plugins/reference/whatsapp)** (`@remoteclaw/whatsapp`) - included in RemoteClaw. Adds the WhatsApp channel surface for sending and receiving RemoteClaw messages.

- **[zalo](/plugins/reference/zalo)** (`@remoteclaw/zalo`) - included in RemoteClaw. Adds the Zalo channel surface for sending and receiving RemoteClaw messages.

- **[zalouser](/plugins/reference/zalouser)** (`@remoteclaw/zalouser`) - included in RemoteClaw. Adds the Zalo Personal channel surface for sending and receiving RemoteClaw messages.

## Official external packages

0 plugins

_None._

## Source checkout only

0 plugins

_None._
