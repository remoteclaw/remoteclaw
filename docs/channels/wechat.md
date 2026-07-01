---
summary: "WeChat channel setup through the external remoteclaw-weixin plugin"
read_when:
  - You want to connect RemoteClaw to WeChat or Weixin
  - You are installing or troubleshooting the remoteclaw-weixin channel plugin
  - You need to understand how external channel plugins run beside the Gateway
title: "WeChat"
---

RemoteClaw connects to WeChat through Tencent's external
`@tencent-weixin/remoteclaw-weixin` channel plugin.

Status: external plugin. Direct chats and media are supported. Group chats are not
advertised by the current plugin capability metadata.

## Naming

- **WeChat** is the user-facing name in these docs.
- **Weixin** is the name used by Tencent's package and by the plugin id.
- `remoteclaw-weixin` is the RemoteClaw channel id.
- `@tencent-weixin/remoteclaw-weixin` is the npm package.

Use `remoteclaw-weixin` in CLI commands and config paths.

## How it works

The WeChat code does not live in the RemoteClaw core repo. RemoteClaw provides the
generic channel plugin contract, and the external plugin provides the
WeChat-specific runtime:

1. `remoteclaw plugins install` installs `@tencent-weixin/remoteclaw-weixin`.
2. The Gateway discovers the plugin manifest and loads the plugin entrypoint.
3. The plugin registers channel id `remoteclaw-weixin`.
4. `remoteclaw channels login --channel remoteclaw-weixin` starts QR login.
5. The plugin stores account credentials under the RemoteClaw state directory.
6. When the Gateway starts, the plugin starts its Weixin monitor for each
   configured account.
7. Inbound WeChat messages are normalized through the channel contract, routed to
   the selected RemoteClaw agent, and sent back through the plugin outbound path.

That separation matters: RemoteClaw core should stay channel-agnostic. WeChat login,
Tencent iLink API calls, media upload/download, context tokens, and account
monitoring are owned by the external plugin.

## Install

Quick install:

```bash
npx -y @tencent-weixin/remoteclaw-weixin-cli install
```

Manual install:

```bash
remoteclaw plugins install "@tencent-weixin/remoteclaw-weixin"
remoteclaw config set plugins.entries.remoteclaw-weixin.enabled true
```

Restart the Gateway after install:

```bash
remoteclaw gateway restart
```

## Login

Run QR login on the same machine that runs the Gateway:

```bash
remoteclaw channels login --channel remoteclaw-weixin
```

Scan the QR code with WeChat on your phone and confirm the login. The plugin saves
the account token locally after a successful scan.

To add another WeChat account, run the same login command again. For multiple
accounts, isolate direct-message sessions by account, channel, and sender:

```bash
remoteclaw config set session.dmScope per-account-channel-peer
```

## Access control

Direct messages use the normal RemoteClaw pairing and allowlist model for channel
plugins.

Approve new senders:

```bash
remoteclaw pairing list remoteclaw-weixin
remoteclaw pairing approve remoteclaw-weixin <CODE>
```

For the full access-control model, see [Pairing](/channels/pairing).

## Compatibility

The plugin checks the host RemoteClaw version at startup.

| Plugin line | RemoteClaw version      | npm tag  |
| ----------- | ----------------------- | -------- |
| `2.x`       | `>=2026.3.22`           | `latest` |
| `1.x`       | `>=2026.1.0 <2026.3.22` | `legacy` |

If the plugin reports that your RemoteClaw version is too old, either update
RemoteClaw or install the legacy plugin line:

```bash
remoteclaw plugins install @tencent-weixin/remoteclaw-weixin@legacy
```

## Sidecar process

The WeChat plugin can run helper work beside the Gateway while it monitors the
Tencent iLink API. In issue #68451, that helper path exposed a bug in RemoteClaw's
generic stale-Gateway cleanup: a child process could try to clean up the parent
Gateway process, causing restart loops under process managers such as systemd.

Current RemoteClaw startup cleanup excludes the current process and its ancestors,
so a channel helper must not kill the Gateway that launched it. This fix is
generic; it is not a WeChat-specific path in core.

## Troubleshooting

Check install and status:

```bash
remoteclaw plugins list
remoteclaw channels status --probe
remoteclaw --version
```

If the channel shows as installed but does not connect, confirm that the plugin is
enabled and restart:

```bash
remoteclaw config set plugins.entries.remoteclaw-weixin.enabled true
remoteclaw gateway restart
```

If the Gateway restarts repeatedly after enabling WeChat, update both RemoteClaw and
the plugin:

```bash
npm view @tencent-weixin/remoteclaw-weixin version
remoteclaw plugins install "@tencent-weixin/remoteclaw-weixin" --force
remoteclaw gateway restart
```

Temporary disable:

```bash
remoteclaw config set plugins.entries.remoteclaw-weixin.enabled false
remoteclaw gateway restart
```

## Related docs

- Channel overview: [Chat Channels](/channels)
- Pairing: [Pairing](/channels/pairing)
- Channel routing: [Channel Routing](/channels/channel-routing)
- Plugin architecture: [Plugin Architecture](/plugins/architecture)
- Channel plugin SDK: [Channel Plugin SDK](/plugins/sdk-channel-plugins)
- External package: [@tencent-weixin/remoteclaw-weixin](https://www.npmjs.com/package/@tencent-weixin/remoteclaw-weixin)
