---
summary: "ClickClack bot-token channel setup and target syntax"
read_when:
  - Connecting RemoteClaw to a ClickClack workspace
  - Testing ClickClack bot identities
title: "ClickClack"
sidebarTitle: "ClickClack"
---

ClickClack connects RemoteClaw to a self-hosted ClickClack workspace through first-class ClickClack bot tokens.

Use this when you want a RemoteClaw agent to appear as a ClickClack bot user. ClickClack supports independent service bots and user-owned bots; user-owned bots keep an `owner_user_id` and receive only the token scopes you grant.

## Quick setup

Create a bot token in ClickClack:

```bash
clickclack admin bot create \
  --workspace <workspace_id_or_slug> \
  --name "RemoteClaw" \
  --handle remoteclaw \
  --scopes bot:write \
  --plain
```

For a user-owned bot, add `--owner <user_id>`.

Configure RemoteClaw:

```json5
{
  channels: {
    clickclack: {
      enabled: true,
      baseUrl: "https://app.clickclack.example",
      token: { source: "env", provider: "default", id: "CLICKCLACK_BOT_TOKEN" },
      workspace: "default",
      defaultTo: "channel:general",
      allowFrom: ["usr_your_user_id"],
      agentId: "clickclack-bot",
    },
  },
}
```

`allowFrom` is required, not optional: it defaults to `[]` and an empty
allowlist admits nobody. See [Access control](#access-control).

Then run:

```bash
export CLICKCLACK_BOT_TOKEN="ccb_..."
remoteclaw gateway
```

If `plugins.allow` is a non-empty restrictive list, explicitly selecting
ClickClack in channel setup or running `remoteclaw plugins enable clickclack`
appends `clickclack` to that list. Onboarding installation uses the same
explicit-selection behavior. These paths do not override `plugins.deny` or a
global `plugins.enabled: false` setting. A direct
`remoteclaw plugins install ./path/to/local/clickclack-plugin` follows the normal
plugin-install policy and also records ClickClack in an existing allowlist.

## Access control

ClickClack admission is **allowlist-only**, in direct conversations and in
channels alike. `allowFrom` is the allowlist; a sender that does not match it is
dropped before the message reaches the agent pipeline. There is no open-policy
mode for this channel — the adapter pins its DM and group policies rather than
reading them from config.

### ClickClack admits nobody until you set `allowFrom`

`allowFrom` defaults to `[]`, and an empty allowlist means **deny-all — not
allow-all**. An account with no `allowFrom` accepts no inbound message from
anyone, and the bot will appear to ignore everything it receives.

ClickClack has no guided onboarding flow. Selecting it in `remoteclaw onboard`
enables the plugin, but the wizard then reports that this channel "does not
support onboarding yet" and writes nothing under `channels.clickclack`. Every
ClickClack channel config is written by hand, so **you must always set
`allowFrom` yourself**, once per account: each account carries its own
allowlist, and an account you add to `channels.clickclack.accounts` without one
admits nobody.

This is the intended fail-closed posture, and a deliberate RemoteClaw divergence
from upstream OpenClaw, which defaults to `["*"]`.

### Allowlist entries

Entries may be written as a bare user id or with a provider/DM prefix; all four
forms below resolve to the same user:

```json5
allowFrom: ["usr_123", "clickclack:usr_123", "cc:usr_123", "dm:usr_123"]
```

Set `["*"]` explicitly to admit every workspace member — that opt-in still
works, it is simply no longer what you get by default. Command authorization is
evaluated only for senders that were already admitted — it never widens
admission.

## Multiple bots

Each account opens its own ClickClack realtime connection and uses its own bot token.

```json5
{
  channels: {
    clickclack: {
      enabled: true,
      baseUrl: "https://app.clickclack.example",
      defaultAccount: "service",
      accounts: {
        service: {
          token: { source: "env", provider: "default", id: "CLICKCLACK_SERVICE_BOT_TOKEN" },
          workspace: "default",
          defaultTo: "channel:general",
          allowFrom: ["usr_your_user_id"],
          agentId: "service-bot",
        },
        support: {
          token: { source: "env", provider: "default", id: "CLICKCLACK_SUPPORT_BOT_TOKEN" },
          workspace: "default",
          defaultTo: "dm:usr_...",
          allowFrom: ["usr_your_user_id"],
          agentId: "support-bot",
        },
      },
    },
  },
}
```

## Reply timeout

`timeoutSeconds` bounds how long a single agent turn may run before the reply is
given up on. It is optional; omit it to use the global reply timeout.

```json5
{
  channels: {
    clickclack: {
      timeoutSeconds: 180,
    },
  },
}
```

Every reply routes through the standard RemoteClaw agent pipeline. Upstream
OpenClaw additionally offered a `replyMode: "model"` shortcut that ran short
completions in-process; RemoteClaw does not ship an in-process model surface
(CLI runtimes own model execution), so that mode and its `model` /
`systemPrompt` settings are not part of this channel.

## Targets

- `channel:<name-or-id>` sends to a workspace channel. Bare targets default to `channel:`.
- `dm:<user_id>` creates or reuses a direct conversation with that user.
- `thread:<message_id>` replies in an existing thread.

Examples:

```bash
remoteclaw message send --channel clickclack --target channel:general --message "hello"
remoteclaw message send --channel clickclack --target dm:usr_123 --message "hello"
remoteclaw message send --channel clickclack --target thread:msg_123 --message "following up"
```

## Permissions

ClickClack token scopes are enforced by the ClickClack API.

- `bot:read`: read workspace/channel/message/thread/DM/realtime/profile data.
- `bot:write`: `bot:read` plus channel messages, thread replies, DMs, and uploads.
- `bot:admin`: `bot:write` plus channel creation.

RemoteClaw only needs `bot:write` for normal agent chat.

## Network posture

The ClickClack client talks directly to the configured `baseUrl` over HTTP and a
realtime WebSocket. `baseUrl` is operator-supplied local configuration, never a
value taken from inbound traffic, so requests are not routed through
RemoteClaw's SSRF dispatcher. Point `baseUrl` only at a ClickClack deployment
you control.

## Troubleshooting

- `ClickClack is not configured`: set `channels.clickclack.token` or `CLICKCLACK_BOT_TOKEN`.
- `workspace not found`: set `workspace` to the workspace id or slug returned by ClickClack.
- No inbound replies: confirm `allowFrom` is set at all — it defaults to `[]`, which admits nobody — and that the sender is in it. Then check the token has realtime read access and the bot is not replying to its own messages.
- Channel sends fail: verify the bot is a member of the workspace and has `bot:write`.
