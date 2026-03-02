---
description: "Zalo Personal plugin: QR login + messaging via native zca-js (plugin install + channel config + tool)"
read_when:
  - You want Zalo Personal (unofficial) support in RemoteClaw
  - You are configuring or developing the zalouser plugin
title: "Zalo Personal Plugin"
---

# Zalo Personal (plugin)

Zalo Personal support for RemoteClaw via a plugin, using native `zca-js` to automate a normal Zalo user account.

> **Warning:** Unofficial automation may lead to account suspension/ban. Use at your own risk.

## Naming

Channel id is `zalouser` to make it explicit this automates a **personal Zalo user account** (unofficial). We keep `zalo` reserved for a potential future official Zalo API integration.

## Where it runs

This plugin runs **inside the Gateway process**.

If you use a remote Gateway, install/configure it on the **machine running the Gateway**, then restart the Gateway.

No external `zca`/`openzca` CLI binary is required.

## Install

### Option A: install from npm

```bash
remoteclaw plugins install @remoteclaw/zalouser
```

Restart the Gateway afterwards.

### Option B: install from a local folder (dev)

```bash
remoteclaw plugins install ./extensions/zalouser
cd ./extensions/zalouser && pnpm install
```

Restart the Gateway afterwards.

## Config

Channel config lives under `channels.zalouser` (not `plugins.entries.*`):

```json5
{
  channels: {
    zalouser: {
      enabled: true,
      dmPolicy: "pairing",
    },
  },
}
```

## CLI

```bash
remoteclaw channels login --channel zalouser
remoteclaw channels logout --channel zalouser
remoteclaw channels status --probe
remoteclaw message send --channel zalouser --target <threadId> --message "Hello from RemoteClaw"
remoteclaw directory peers list --channel zalouser --query "name"
```

## Agent tool

Tool name: `zalouser`

Actions: `send`, `image`, `link`, `friends`, `groups`, `me`, `status`

Channel message actions also support `react` for message reactions.
