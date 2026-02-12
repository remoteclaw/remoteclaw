<p align="center">
  <img src="https://raw.githubusercontent.com/remoteclaw/remoteclaw/main/docs/assets/remoteclaw-logo.png" alt="RemoteClaw" width="640">
</p>

# RemoteClaw

> Your `~/.claude` — remotely.

RemoteClaw bridges your local agent setup to messaging channels. Your skills, agents, config, memory — delivered over WhatsApp, Telegram, Slack, Discord, and 20+ more channels. The [AgentRuntime](AGENT_RUNTIME.md) abstraction does the work.

Supported runtimes (via AgentRuntime):

- **Claude** — CLI and Agent SDK
- **Gemini** — CLI
- **Codex** — CLI

```
~/.<agent> ──► AgentRuntime ──► RemoteClaw Gateway ──► Channels
```

**Channels**: Telegram, WhatsApp, Discord, Slack, Signal, iMessage, Google Chat, IRC, Microsoft Teams, Matrix, BlueBubbles, Mattermost, Nextcloud Talk, Line, Nostr, Twitch, Feishu, Zalo, Tlon, WebChat.

Fork of [OpenClaw](https://github.com/openclaw/openclaw), preserving the channel adapter layer.

[Discussions](https://github.com/remoteclaw/remoteclaw/discussions)

Preferred setup: run the onboarding wizard (`remoteclaw onboard`) in your terminal.
The wizard guides you step by step through setting up the gateway, workspace, channels, and skills. The CLI wizard is the recommended path and works on **macOS, Linux, and Windows (via WSL2; strongly recommended)**.
Works with npm, pnpm, or bun.
New install? Start here: [Getting started](https://docs.remoteclaw.org/start/getting-started)

**Subscriptions (OAuth):**

- **[Anthropic](https://www.anthropic.com/)** (Claude Pro/Max)
- **[OpenAI](https://openai.com/)** (ChatGPT/Codex)

Model note: while any model is supported, I strongly recommend **Anthropic Pro/Max (100/200) + Opus 4.6** for long-context strength and better prompt-injection resistance. See [Onboarding](https://docs.remoteclaw.org/start/onboarding).

## How It Differs from OpenClaw

|                      | RemoteClaw                                                                   | OpenClaw                                             |
| -------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Audience**         | `~/.<agent>` power users with lots of skills                                 | People who don't have that (yet)                     |
| **Execution engine** | [AgentRuntime](AGENT_RUNTIME.md) (Claude Agent SDK reference implementation) | pi-agent-core / pi-ai / pi-coding-agent              |
| **Ecosystem**        | Your `~/.<agent>` setup runs as-is — your workspace, your responsibility     | ClawHub marketplace + regex-scanned community skills |

## Models (selection + auth)

- Models config + CLI: [Models](https://docs.remoteclaw.org/concepts/models)
- Auth profile rotation (OAuth vs API keys) + fallbacks: [Model failover](https://docs.remoteclaw.org/concepts/model-failover)

## Install (recommended)

Runtime: **Node >=22**.

```bash
npm install -g remoteclaw@latest
# or: pnpm add -g remoteclaw@latest

remoteclaw onboard --install-daemon
```

The wizard installs the Gateway daemon (launchd/systemd user service) so it stays running.

## Quick start (TL;DR)

Runtime: **Node >=22**.

Full beginner guide (auth, pairing, channels): [Getting started](https://docs.remoteclaw.org/start/getting-started)

```bash
remoteclaw onboard --install-daemon

remoteclaw gateway --port 18789 --verbose

# Send a message
remoteclaw message send --to +1234567890 --message "Hello from RemoteClaw"

# Talk to the assistant (optionally deliver back to any connected channel: WhatsApp/Telegram/Slack/Discord/Google Chat/Signal/iMessage/BlueBubbles/Microsoft Teams/Matrix/Zalo/Zalo Personal/WebChat)
remoteclaw agent --message "Ship checklist" --thinking high
```

Upgrading? [Updating guide](https://docs.remoteclaw.org/install/updating) (and run `remoteclaw doctor`).

## Development channels

- **stable**: tagged releases (`vYYYY.M.D` or `vYYYY.M.D-<patch>`), npm dist-tag `latest`.
- **beta**: prerelease tags (`vYYYY.M.D-beta.N`), npm dist-tag `beta` (macOS app may be missing).
- **dev**: moving head of `main`, npm dist-tag `dev` (when published).

Switch channels (git + npm): `remoteclaw update --channel stable|beta|dev`.
Details: [Development channels](https://docs.remoteclaw.org/install/development-channels).

## From source (development)

Prefer `pnpm` for builds from source. Bun is optional for running TypeScript directly.

```bash
git clone https://github.com/remoteclaw/remoteclaw.git
cd remoteclaw

pnpm install
pnpm ui:build # auto-installs UI deps on first run
pnpm build

pnpm remoteclaw onboard --install-daemon

# Dev loop (auto-reload on TS changes)
pnpm gateway:watch
```

Note: `pnpm remoteclaw ...` runs TypeScript directly (via `tsx`). `pnpm build` produces `dist/` for running via Node / the packaged `remoteclaw` binary.

## Security defaults (DM access)

RemoteClaw connects to real messaging surfaces. Treat inbound DMs as **untrusted input**.

Full security guide: [Security](https://docs.remoteclaw.org/gateway/security)

Default behavior on Telegram/WhatsApp/Signal/iMessage/Microsoft Teams/Discord/Google Chat/Slack:

- **DM pairing** (`dmPolicy="pairing"` / `channels.discord.dm.policy="pairing"` / `channels.slack.dm.policy="pairing"`): unknown senders receive a short pairing code and the bot does not process their message.
- Approve with: `remoteclaw pairing approve <channel> <code>` (then the sender is added to a local allowlist store).
- Public inbound DMs require an explicit opt-in: set `dmPolicy="open"` and include `"*"` in the channel allowlist (`allowFrom` / `channels.discord.dm.allowFrom` / `channels.slack.dm.allowFrom`).

Run `remoteclaw doctor` to surface risky/misconfigured DM policies.

## Highlights

- **[Local-first Gateway](https://docs.remoteclaw.org/gateway)** — single control plane for sessions, channels, tools, and events.
- **[Multi-channel inbox](https://docs.remoteclaw.org/channels)** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, BlueBubbles (iMessage), iMessage (legacy), Microsoft Teams, Matrix, Zalo, Zalo Personal, WebChat, macOS, iOS/Android.
- **[Multi-agent routing](https://docs.remoteclaw.org/gateway/configuration)** — route inbound channels/accounts/peers to isolated agents (workspaces + per-agent sessions).
- **[Voice Wake](https://docs.remoteclaw.org/nodes/voicewake) + [Talk Mode](https://docs.remoteclaw.org/nodes/talk)** — always-on speech for macOS/iOS/Android with ElevenLabs.
- **[Live Canvas](https://docs.remoteclaw.org/platforms/mac/canvas)** — agent-driven visual workspace with [A2UI](https://docs.remoteclaw.org/platforms/mac/canvas#canvas-a2ui).
- **[First-class tools](https://docs.remoteclaw.org/tools)** — browser, canvas, nodes, cron, sessions, and Discord/Slack actions.
- **[Companion apps](https://docs.remoteclaw.org/platforms/macos)** — macOS menu bar app + iOS/Android [nodes](https://docs.remoteclaw.org/nodes).
- **[Onboarding](https://docs.remoteclaw.org/start/wizard) + [skills](https://docs.remoteclaw.org/tools/skills)** — wizard-driven setup with bundled/managed/workspace skills.

## Everything we built so far

### Core platform

- [Gateway WS control plane](https://docs.remoteclaw.org/gateway) with sessions, presence, config, cron, webhooks, [Control UI](https://docs.remoteclaw.org/web), and [Canvas host](https://docs.remoteclaw.org/platforms/mac/canvas#canvas-a2ui).
- [CLI surface](https://docs.remoteclaw.org/tools/agent-send): gateway, agent, send, [wizard](https://docs.remoteclaw.org/start/wizard), and [doctor](https://docs.remoteclaw.org/gateway/doctor).
- [AgentRuntime](AGENT_RUNTIME.md) with tool streaming and block streaming.
- [Session model](https://docs.remoteclaw.org/concepts/session): `main` for direct chats, group isolation, activation modes, queue modes, reply-back. Group rules: [Groups](https://docs.remoteclaw.org/concepts/groups).
- [Media pipeline](https://docs.remoteclaw.org/nodes/images): images/audio/video, transcription hooks, size caps, temp file lifecycle. Audio details: [Audio](https://docs.remoteclaw.org/nodes/audio).

### Channels

- [Channels](https://docs.remoteclaw.org/channels): [WhatsApp](https://docs.remoteclaw.org/channels/whatsapp) (Baileys), [Telegram](https://docs.remoteclaw.org/channels/telegram) (grammY), [Slack](https://docs.remoteclaw.org/channels/slack) (Bolt), [Discord](https://docs.remoteclaw.org/channels/discord) (discord.js), [Google Chat](https://docs.remoteclaw.org/channels/googlechat) (Chat API), [Signal](https://docs.remoteclaw.org/channels/signal) (signal-cli), [BlueBubbles](https://docs.remoteclaw.org/channels/bluebubbles) (iMessage, recommended), [iMessage](https://docs.remoteclaw.org/channels/imessage) (legacy imsg), [Microsoft Teams](https://docs.remoteclaw.org/channels/msteams) (extension), [Matrix](https://docs.remoteclaw.org/channels/matrix) (extension), [Zalo](https://docs.remoteclaw.org/channels/zalo) (extension), [Zalo Personal](https://docs.remoteclaw.org/channels/zalouser) (extension), [WebChat](https://docs.remoteclaw.org/web/webchat).
- [Group routing](https://docs.remoteclaw.org/concepts/group-messages): mention gating, reply tags, per-channel chunking and routing. Channel rules: [Channels](https://docs.remoteclaw.org/channels).

### Apps + nodes

- [macOS app](https://docs.remoteclaw.org/platforms/macos): menu bar control plane, [Voice Wake](https://docs.remoteclaw.org/nodes/voicewake)/PTT, [Talk Mode](https://docs.remoteclaw.org/nodes/talk) overlay, [WebChat](https://docs.remoteclaw.org/web/webchat), debug tools, [remote gateway](https://docs.remoteclaw.org/gateway/remote) control.
- [iOS node](https://docs.remoteclaw.org/platforms/ios): [Canvas](https://docs.remoteclaw.org/platforms/mac/canvas), [Voice Wake](https://docs.remoteclaw.org/nodes/voicewake), [Talk Mode](https://docs.remoteclaw.org/nodes/talk), camera, screen recording, Bonjour pairing.
- [Android node](https://docs.remoteclaw.org/platforms/android): [Canvas](https://docs.remoteclaw.org/platforms/mac/canvas), [Talk Mode](https://docs.remoteclaw.org/nodes/talk), camera, screen recording, optional SMS.
- [macOS node mode](https://docs.remoteclaw.org/nodes): system.run/notify + canvas/camera exposure.

### Tools + automation

- [Browser control](https://docs.remoteclaw.org/tools/browser): dedicated RemoteClaw Chrome/Chromium, snapshots, actions, uploads, profiles.
- [Canvas](https://docs.remoteclaw.org/platforms/mac/canvas): [A2UI](https://docs.remoteclaw.org/platforms/mac/canvas#canvas-a2ui) push/reset, eval, snapshot.
- [Nodes](https://docs.remoteclaw.org/nodes): camera snap/clip, screen record, [location.get](https://docs.remoteclaw.org/nodes/location-command), notifications.
- [Cron + wakeups](https://docs.remoteclaw.org/automation/cron-jobs); [webhooks](https://docs.remoteclaw.org/automation/webhook); [Gmail Pub/Sub](https://docs.remoteclaw.org/automation/gmail-pubsub).
- [Skills platform](https://docs.remoteclaw.org/tools/skills): bundled, managed, and workspace skills with install gating + UI.

### Runtime + safety

- [Channel routing](https://docs.remoteclaw.org/concepts/channel-routing), [retry policy](https://docs.remoteclaw.org/concepts/retry), and [streaming/chunking](https://docs.remoteclaw.org/concepts/streaming).
- [Presence](https://docs.remoteclaw.org/concepts/presence), [typing indicators](https://docs.remoteclaw.org/concepts/typing-indicators), and [usage tracking](https://docs.remoteclaw.org/concepts/usage-tracking).
- [Models](https://docs.remoteclaw.org/concepts/models), [model failover](https://docs.remoteclaw.org/concepts/model-failover), and [session pruning](https://docs.remoteclaw.org/concepts/session-pruning).
- [Security](https://docs.remoteclaw.org/gateway/security) and [troubleshooting](https://docs.remoteclaw.org/channels/troubleshooting).

### Ops + packaging

- [Control UI](https://docs.remoteclaw.org/web) + [WebChat](https://docs.remoteclaw.org/web/webchat) served directly from the Gateway.
- [Tailscale Serve/Funnel](https://docs.remoteclaw.org/gateway/tailscale) or [SSH tunnels](https://docs.remoteclaw.org/gateway/remote) with token/password auth.
- [Nix mode](https://docs.remoteclaw.org/install/nix) for declarative config; [Docker](https://docs.remoteclaw.org/install/docker)-based installs.
- [Doctor](https://docs.remoteclaw.org/gateway/doctor) migrations, [logging](https://docs.remoteclaw.org/logging).

## How it works (short)

```
WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / Microsoft Teams / Matrix / Zalo / Zalo Personal / WebChat
               │
               ▼
┌───────────────────────────────┐
│            Gateway            │
│       (control plane)         │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ AgentRuntime
               ├─ CLI (remoteclaw …)
               ├─ WebChat UI
               ├─ macOS app
               └─ iOS / Android nodes
```

## Key subsystems

- **[Gateway WebSocket network](https://docs.remoteclaw.org/concepts/architecture)** — single WS control plane for clients, tools, and events (plus ops: [Gateway runbook](https://docs.remoteclaw.org/gateway)).
- **[Tailscale exposure](https://docs.remoteclaw.org/gateway/tailscale)** — Serve/Funnel for the Gateway dashboard + WS (remote access: [Remote](https://docs.remoteclaw.org/gateway/remote)).
- **[Browser control](https://docs.remoteclaw.org/tools/browser)** — RemoteClaw-managed Chrome/Chromium with CDP control.
- **[Canvas + A2UI](https://docs.remoteclaw.org/platforms/mac/canvas)** — agent-driven visual workspace (A2UI host: [Canvas/A2UI](https://docs.remoteclaw.org/platforms/mac/canvas#canvas-a2ui)).
- **[Voice Wake](https://docs.remoteclaw.org/nodes/voicewake) + [Talk Mode](https://docs.remoteclaw.org/nodes/talk)** — always-on speech and continuous conversation.
- **[Nodes](https://docs.remoteclaw.org/nodes)** — Canvas, camera snap/clip, screen record, `location.get`, notifications, plus macOS-only `system.run`/`system.notify`.

## Tailscale access (Gateway dashboard)

RemoteClaw can auto-configure Tailscale **Serve** (tailnet-only) or **Funnel** (public) while the Gateway stays bound to loopback. Configure `gateway.tailscale.mode`:

- `off`: no Tailscale automation (default).
- `serve`: tailnet-only HTTPS via `tailscale serve` (uses Tailscale identity headers by default).
- `funnel`: public HTTPS via `tailscale funnel` (requires shared password auth).

Notes:

- `gateway.bind` must stay `loopback` when Serve/Funnel is enabled (RemoteClaw enforces this).
- Serve can be forced to require a password by setting `gateway.auth.mode: "password"` or `gateway.auth.allowTailscale: false`.
- Funnel refuses to start unless `gateway.auth.mode: "password"` is set.
- Optional: `gateway.tailscale.resetOnExit` to undo Serve/Funnel on shutdown.

Details: [Tailscale guide](https://docs.remoteclaw.org/gateway/tailscale) · [Web surfaces](https://docs.remoteclaw.org/web)

## Remote Gateway (Linux is great)

It's perfectly fine to run the Gateway on a small Linux instance. Clients (macOS app, CLI, WebChat) can connect over **Tailscale Serve/Funnel** or **SSH tunnels**, and you can still pair device nodes (macOS/iOS/Android) to execute device-local actions when needed.

- **Gateway host** runs the exec tool and channel connections by default.
- **Device nodes** run device-local actions (`system.run`, camera, screen recording, notifications) via `node.invoke`.
  In short: exec runs where the Gateway lives; device actions run where the device lives.

Details: [Remote access](https://docs.remoteclaw.org/gateway/remote) · [Nodes](https://docs.remoteclaw.org/nodes) · [Security](https://docs.remoteclaw.org/gateway/security)

## macOS permissions via the Gateway protocol

The macOS app can run in **node mode** and advertises its capabilities + permission map over the Gateway WebSocket (`node.list` / `node.describe`). Clients can then execute local actions via `node.invoke`:

- `system.run` runs a local command and returns stdout/stderr/exit code; set `needsScreenRecording: true` to require screen-recording permission (otherwise you'll get `PERMISSION_MISSING`).
- `system.notify` posts a user notification and fails if notifications are denied.
- `canvas.*`, `camera.*`, `screen.record`, and `location.get` are also routed via `node.invoke` and follow TCC permission status.

Elevated bash (host permissions) is separate from macOS TCC:

- Use `/elevated on|off` to toggle per-session elevated access when enabled + allowlisted.
- Gateway persists the per-session toggle via `sessions.patch` (WS method) alongside `thinkingLevel`, `verboseLevel`, `model`, `sendPolicy`, and `groupActivation`.

Details: [Nodes](https://docs.remoteclaw.org/nodes) · [macOS app](https://docs.remoteclaw.org/platforms/macos) · [Gateway protocol](https://docs.remoteclaw.org/concepts/architecture)

## Agent to Agent (sessions\_\* tools)

- Use these to coordinate work across sessions without jumping between chat surfaces.
- `sessions_list` — discover active sessions (agents) and their metadata.
- `sessions_history` — fetch transcript logs for a session.
- `sessions_send` — message another session; optional reply-back ping-pong + announce step (`REPLY_SKIP`, `ANNOUNCE_SKIP`).

Details: [Session tools](https://docs.remoteclaw.org/concepts/session-tool)

## Chat commands

Send these in WhatsApp/Telegram/Slack/Google Chat/Microsoft Teams/WebChat (group commands are owner-only):

- `/status` — compact session status (model + tokens, cost when available)
- `/new` or `/reset` — reset the session
- `/compact` — compact session context (summary)
- `/think <level>` — off|minimal|low|medium|high|xhigh (GPT-5.2 + Codex models only)
- `/verbose on|off`
- `/usage off|tokens|full` — per-response usage footer
- `/restart` — restart the gateway (owner-only in groups)
- `/activation mention|always` — group activation toggle (groups only)

## Apps (optional)

The Gateway alone delivers a great experience. All apps are optional and add extra features.

If you plan to build/run companion apps, follow the platform runbooks below.

### macOS (RemoteClaw.app) (optional)

- Menu bar control for the Gateway and health.
- Voice Wake + push-to-talk overlay.
- WebChat + debug tools.
- Remote gateway control over SSH.

Note: signed builds required for macOS permissions to stick across rebuilds (see `docs/mac/permissions.md`).

### iOS node (optional)

- Pairs as a node via the Bridge.
- Voice trigger forwarding + Canvas surface.
- Controlled via `remoteclaw nodes ...`.

Runbook: [iOS connect](https://docs.remoteclaw.org/platforms/ios).

### Android node (optional)

- Pairs via the same Bridge + pairing flow as iOS.
- Exposes Canvas, Camera, and Screen capture commands.
- Runbook: [Android connect](https://docs.remoteclaw.org/platforms/android).

## Agent workspace + skills

- Workspace root: `~/.remoteclaw/workspace` (configurable via `agents.defaults.workspace`).
- Injected prompt files: `AGENTS.md`, `SOUL.md`, `TOOLS.md`.
- Skills: `~/.remoteclaw/workspace/skills/<skill>/SKILL.md`.

## Configuration

Minimal `~/.remoteclaw/remoteclaw.json` (model + defaults):

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-6",
  },
}
```

[Full configuration reference (all keys + examples).](https://docs.remoteclaw.org/gateway/configuration)

## Security model (important)

- **Default:** tools run on the host for the **main** session, so the agent has full access when it's just you.
- **Group/channel safety:** set `agents.defaults.sandbox.mode: "non-main"` to run **non-main sessions** (groups/channels) inside per-session Docker sandboxes; bash then runs in Docker for those sessions.
- **Sandbox defaults:** allowlist `bash`, `process`, `read`, `write`, `edit`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`; denylist `browser`, `canvas`, `nodes`, `cron`, `discord`, `gateway`.

Details: [Security guide](https://docs.remoteclaw.org/gateway/security) · [Docker + sandboxing](https://docs.remoteclaw.org/install/docker) · [Sandbox config](https://docs.remoteclaw.org/gateway/configuration)

### [WhatsApp](https://docs.remoteclaw.org/channels/whatsapp)

- Link the device: `pnpm remoteclaw channels login` (stores creds in `~/.remoteclaw/credentials`).
- Allowlist who can talk to the assistant via `channels.whatsapp.allowFrom`.
- If `channels.whatsapp.groups` is set, it becomes a group allowlist; include `"*"` to allow all.

### [Telegram](https://docs.remoteclaw.org/channels/telegram)

- Set `TELEGRAM_BOT_TOKEN` or `channels.telegram.botToken` (env wins).
- Optional: set `channels.telegram.groups` (with `channels.telegram.groups."*".requireMention`); when set, it is a group allowlist (include `"*"` to allow all). Also `channels.telegram.allowFrom` or `channels.telegram.webhookUrl` + `channels.telegram.webhookSecret` as needed.

```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABCDEF",
    },
  },
}
```

### [Slack](https://docs.remoteclaw.org/channels/slack)

- Set `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` (or `channels.slack.botToken` + `channels.slack.appToken`).

### [Discord](https://docs.remoteclaw.org/channels/discord)

- Set `DISCORD_BOT_TOKEN` or `channels.discord.token` (env wins).
- Optional: set `commands.native`, `commands.text`, or `commands.useAccessGroups`, plus `channels.discord.dm.allowFrom`, `channels.discord.guilds`, or `channels.discord.mediaMaxMb` as needed.

```json5
{
  channels: {
    discord: {
      token: "1234abcd",
    },
  },
}
```

### [Signal](https://docs.remoteclaw.org/channels/signal)

- Requires `signal-cli` and a `channels.signal` config section.

### [BlueBubbles (iMessage)](https://docs.remoteclaw.org/channels/bluebubbles)

- **Recommended** iMessage integration.
- Configure `channels.bluebubbles.serverUrl` + `channels.bluebubbles.password` and a webhook (`channels.bluebubbles.webhookPath`).
- The BlueBubbles server runs on macOS; the Gateway can run on macOS or elsewhere.

### [iMessage (legacy)](https://docs.remoteclaw.org/channels/imessage)

- Legacy macOS-only integration via `imsg` (Messages must be signed in).
- If `channels.imessage.groups` is set, it becomes a group allowlist; include `"*"` to allow all.

### [Microsoft Teams](https://docs.remoteclaw.org/channels/msteams)

- Configure a Teams app + Bot Framework, then add a `msteams` config section.
- Allowlist who can talk via `msteams.allowFrom`; group access via `msteams.groupAllowFrom` or `msteams.groupPolicy: "open"`.

### [WebChat](https://docs.remoteclaw.org/web/webchat)

- Uses the Gateway WebSocket; no separate WebChat port/config.

Browser control (optional):

```json5
{
  browser: {
    enabled: true,
    color: "#FF4500",
  },
}
```

## Docs

Use these when you're past the onboarding flow and want the deeper reference.

- [Start with the docs index for navigation and "what's where."](https://docs.remoteclaw.org)
- [Read the architecture overview for the gateway + protocol model.](https://docs.remoteclaw.org/concepts/architecture)
- [Use the full configuration reference when you need every key and example.](https://docs.remoteclaw.org/gateway/configuration)
- [Run the Gateway by the book with the operational runbook.](https://docs.remoteclaw.org/gateway)
- [Learn how the Control UI/Web surfaces work and how to expose them safely.](https://docs.remoteclaw.org/web)
- [Understand remote access over SSH tunnels or tailnets.](https://docs.remoteclaw.org/gateway/remote)
- [Follow the onboarding wizard flow for a guided setup.](https://docs.remoteclaw.org/start/wizard)
- [Wire external triggers via the webhook surface.](https://docs.remoteclaw.org/automation/webhook)
- [Set up Gmail Pub/Sub triggers.](https://docs.remoteclaw.org/automation/gmail-pubsub)
- [Learn the macOS menu bar companion details.](https://docs.remoteclaw.org/platforms/mac/menu-bar)
- [Platform guides: Windows (WSL2)](https://docs.remoteclaw.org/platforms/windows), [Linux](https://docs.remoteclaw.org/platforms/linux), [macOS](https://docs.remoteclaw.org/platforms/macos), [iOS](https://docs.remoteclaw.org/platforms/ios), [Android](https://docs.remoteclaw.org/platforms/android)
- [Debug common failures with the troubleshooting guide.](https://docs.remoteclaw.org/channels/troubleshooting)
- [Review security guidance before exposing anything.](https://docs.remoteclaw.org/gateway/security)

## Advanced docs (discovery + control)

- [Discovery + transports](https://docs.remoteclaw.org/gateway/discovery)
- [Bonjour/mDNS](https://docs.remoteclaw.org/gateway/bonjour)
- [Gateway pairing](https://docs.remoteclaw.org/gateway/pairing)
- [Remote gateway README](https://docs.remoteclaw.org/gateway/remote-gateway-readme)
- [Control UI](https://docs.remoteclaw.org/web/control-ui)
- [Dashboard](https://docs.remoteclaw.org/web/dashboard)

## Operations & troubleshooting

- [Health checks](https://docs.remoteclaw.org/gateway/health)
- [Gateway lock](https://docs.remoteclaw.org/gateway/gateway-lock)
- [Background process](https://docs.remoteclaw.org/gateway/background-process)
- [Browser troubleshooting (Linux)](https://docs.remoteclaw.org/tools/browser-linux-troubleshooting)
- [Logging](https://docs.remoteclaw.org/logging)

## Deep dives

- [Agent loop](https://docs.remoteclaw.org/concepts/agent-loop)
- [Presence](https://docs.remoteclaw.org/concepts/presence)
- [TypeBox schemas](https://docs.remoteclaw.org/concepts/typebox)
- [RPC adapters](https://docs.remoteclaw.org/reference/rpc)
- [Queue](https://docs.remoteclaw.org/concepts/queue)

## Workspace & skills

- [Skills config](https://docs.remoteclaw.org/tools/skills-config)
- [Default AGENTS](https://docs.remoteclaw.org/reference/AGENTS.default)
- [Templates: AGENTS](https://docs.remoteclaw.org/reference/templates/AGENTS)
- [Templates: BOOTSTRAP](https://docs.remoteclaw.org/reference/templates/BOOTSTRAP)
- [Templates: IDENTITY](https://docs.remoteclaw.org/reference/templates/IDENTITY)
- [Templates: SOUL](https://docs.remoteclaw.org/reference/templates/SOUL)
- [Templates: TOOLS](https://docs.remoteclaw.org/reference/templates/TOOLS)
- [Templates: USER](https://docs.remoteclaw.org/reference/templates/USER)

## Platform internals

- [macOS dev setup](https://docs.remoteclaw.org/platforms/mac/dev-setup)
- [macOS menu bar](https://docs.remoteclaw.org/platforms/mac/menu-bar)
- [macOS voice wake](https://docs.remoteclaw.org/platforms/mac/voicewake)
- [iOS node](https://docs.remoteclaw.org/platforms/ios)
- [Android node](https://docs.remoteclaw.org/platforms/android)
- [Windows (WSL2)](https://docs.remoteclaw.org/platforms/windows)
- [Linux app](https://docs.remoteclaw.org/platforms/linux)

## Email hooks (Gmail)

- [docs.remoteclaw.org/gmail-pubsub](https://docs.remoteclaw.org/automation/gmail-pubsub)

## Community

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, maintainers, and how to submit PRs.
