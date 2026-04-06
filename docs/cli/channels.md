---
description: "CLI reference for `remoteclaw channels` (accounts, status, login/logout, logs)"
read_when:
  - You want to add/remove channel accounts (WhatsApp/Telegram/Discord/Google Chat/Slack/Mattermost (plugin)/Signal/iMessage)
  - You want to check channel status or tail channel logs
title: "channels"
---

# `remoteclaw channels`

Manage chat channel accounts and their runtime status on the Gateway.

Related docs:

- Channel guides: [Channels](/channels/index)
- Gateway configuration: [Configuration](/gateway/configuration)

## Common commands

```bash
remoteclaw channels list
remoteclaw channels status
remoteclaw channels capabilities
remoteclaw channels capabilities --channel discord --target channel:123
remoteclaw channels resolve --channel slack "#general" "@jane"
remoteclaw channels logs --channel all
```

## Add / remove accounts

```bash
remoteclaw channels add --channel telegram --token <bot-token>
remoteclaw channels remove --channel telegram --delete
```

Tip: `remoteclaw channels add --help` shows per-channel flags (token, app token, signal-cli paths, etc).

When you run `remoteclaw channels add` without flags, the interactive wizard can prompt:

- account ids per selected channel
- optional display names for those accounts
- `Bind configured channel accounts to agents now?`

If you confirm bind now, the wizard asks which agent should own each configured channel account and writes account-scoped routing bindings.

You can also manage the same routing rules later with `remoteclaw agents bindings`, `remoteclaw agents bind`, and `remoteclaw agents unbind` (see [agents](/cli/agents)).

When you add a non-default account to a channel that is still using single-account top-level settings (no `channels.<channel>.accounts` entries yet), RemoteClaw moves account-scoped single-account top-level values into `channels.<channel>.accounts.default`, then writes the new account. This preserves the original account behavior while moving to the multi-account shape.

Routing behavior stays consistent:

- Existing channel-only bindings (no `accountId`) continue to match the default account.
- `channels add` does not auto-create or rewrite bindings in non-interactive mode.
- Interactive setup can optionally add account-scoped bindings.

If your config was already in a mixed state (named accounts present, missing `default`, and top-level single-account values still set), run `remoteclaw doctor --fix` to move account-scoped values into `accounts.default`.

## Login / logout (interactive)

```bash
remoteclaw channels login --channel whatsapp
remoteclaw channels logout --channel whatsapp
```

## Troubleshooting

- Run `remoteclaw status --deep` for a broad probe.
- Use `remoteclaw doctor` for guided fixes.

## Capabilities probe

Fetch provider capability hints (intents/scopes where available) plus static feature support:

```bash
remoteclaw channels capabilities
remoteclaw channels capabilities --channel discord --target channel:123
```

Notes:

- `--channel` is optional; omit it to list every channel (including extensions).
- `--target` accepts `channel:<id>` or a raw numeric channel id and only applies to Discord.
- Probes are provider-specific: Discord intents + optional channel permissions; Slack bot + user scopes; Telegram bot flags + webhook; Signal daemon version; MS Teams app token + Graph roles/scopes (annotated where known). Channels without probes report `Probe: unavailable`.

## Resolve names to IDs

Resolve channel/user names to IDs using the provider directory:

```bash
remoteclaw channels resolve --channel slack "#general" "@jane"
remoteclaw channels resolve --channel discord "My Server/#support" "@someone"
remoteclaw channels resolve --channel matrix "Project Room"
```

Notes:

- Use `--kind user|group|auto` to force the target type.
- Resolution prefers active matches when multiple entries share the same name.
