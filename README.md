# RemoteClaw

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/remoteclaw/remoteclaw/main/docs/public/assets/remoteclaw-logo-text.png">
        <img src="https://raw.githubusercontent.com/remoteclaw/remoteclaw/main/docs/public/assets/remoteclaw-logo-text-dark.png" alt="RemoteClaw" width="500">
    </picture>
</p>

<p align="center">
  <a href="https://github.com/remoteclaw/remoteclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/remoteclaw/remoteclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/remoteclaw"><img src="https://img.shields.io/npm/v/remoteclaw?style=for-the-badge" alt="npm version"></a>
  <a href="https://github.com/remoteclaw/remoteclaw/releases"><img src="https://img.shields.io/github/v/release/remoteclaw/remoteclaw?include_prereleases&display_name=release&style=for-the-badge&label=GITHUB" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg?style=for-the-badge" alt="AGPL-3.0-only License"></a>
</p>

**RemoteClaw** is AI agent middleware. It connects agent CLIs you already run — Claude Code, Gemini CLI, Codex, OpenCode — to the messaging channels you already use, so you can reach your agents from anywhere: your phone, your team Slack, your WhatsApp, anywhere.

Your agents keep their full power — MCP servers, filesystem access, tools, config — RemoteClaw just bridges the messaging layer. Middleware, not a platform.

## Quick Start

**Prerequisites:** Node.js 22+

### 1. Install

```bash
npm install -g remoteclaw
# or
curl -fsSL https://remoteclaw.sh | bash        # macOS / Linux / Windows (WSL)
irm https://remoteclaw.ps | iex                # Windows (PowerShell)
```

### 2. Configure a channel

Create `~/.remoteclaw/remoteclaw.json` with a channel adapter. Telegram is the simplest — you only need a [bot token from @BotFather](https://core.telegram.org/bots#botfather):

```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    },
  },
}
```

### 3. Install and authenticate your agent CLI

RemoteClaw spawns agent CLIs as subprocesses — install the one you want and make sure it's authenticated on the gateway host. The easiest way is to install the CLI and log in, though you can also configure a token or API key through onboarding.

Claude Code is the default runtime. See each CLI's own docs for setup. Set `runtime` in your config to switch runtimes.

### 4. Start the gateway

```bash
remoteclaw
```

### 5. Test

Send a message to your Telegram bot — you should get a reply from the agent.

To use a different runtime (Gemini, Codex, OpenCode), set `runtime` in your config. See the [configuration reference](https://docs.remoteclaw.org/gateway/configuration) for all options.

## How It Works

```
WhatsApp / Telegram / Slack / Discord / Signal / Teams / iMessage / WebChat / ...
               │
               ▼
┌───────────────────────────────┐
│            Gateway            │
│       (control plane)         │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ Agent runtime (Claude, Gemini, Codex, OpenCode)
               ├─ CLI (remoteclaw …)
               ├─ WebChat UI
               ├─ macOS app
               └─ iOS / Android nodes
```

## Why RemoteClaw

- **Use your agents from anywhere** — message your Claude/Gemini from WhatsApp, Telegram, Slack, Discord, or any supported channel. One agent, all your surfaces.
- **Your config, your tools, your rules** — agents run with your `~/.claude`, your MCP servers, your filesystem. RemoteClaw doesn't touch the agentic loop.
- **Multi-channel, multi-agent** — route different channels or contacts to isolated agents, each with their own workspace and session.
- **Voice built in** — talk to your agent with always-on Voice Wake or push-to-talk on macOS, iOS, and Android.
- **Browser, canvas, and device control** — agents can browse the web, drive a live visual workspace, snap photos, record screens, and send notifications.
- **Secure by default** — unknown DMs require pairing codes. Group sessions can run in Docker sandboxes. You control who talks to your agents.
- **Companion apps** — macOS menu bar app, iOS and Android nodes for device-local actions.
- **Runs anywhere** — local machine, Linux VPS, Docker container. Remote access via Tailscale or SSH tunnels.

## Supported Channels

| Channel                | Type      | Docs                                                      |
| ---------------------- | --------- | --------------------------------------------------------- |
| WhatsApp               | Built-in  | [Guide](https://docs.remoteclaw.org/channels/whatsapp)    |
| Telegram               | Built-in  | [Guide](https://docs.remoteclaw.org/channels/telegram)    |
| Slack                  | Built-in  | [Guide](https://docs.remoteclaw.org/channels/slack)       |
| Discord                | Built-in  | [Guide](https://docs.remoteclaw.org/channels/discord)     |
| Google Chat            | Built-in  | [Guide](https://docs.remoteclaw.org/channels/googlechat)  |
| Signal                 | Built-in  | [Guide](https://docs.remoteclaw.org/channels/signal)      |
| BlueBubbles (iMessage) | Built-in  | [Guide](https://docs.remoteclaw.org/channels/bluebubbles) |
| iMessage (legacy)      | Built-in  | [Guide](https://docs.remoteclaw.org/channels/imessage)    |
| Microsoft Teams        | Extension | [Guide](https://docs.remoteclaw.org/channels/msteams)     |
| Matrix                 | Extension | [Guide](https://docs.remoteclaw.org/channels/matrix)      |
| Zalo                   | Extension | [Guide](https://docs.remoteclaw.org/channels/zalo)        |
| Zalo Personal          | Extension | [Guide](https://docs.remoteclaw.org/channels/zalouser)    |
| WebChat                | Built-in  | [Guide](https://docs.remoteclaw.org/web/webchat)          |

Plus companion apps for [macOS](https://docs.remoteclaw.org/platforms/macos), [iOS](https://docs.remoteclaw.org/platforms/ios), and [Android](https://docs.remoteclaw.org/platforms/android).

## From Source

```bash
git clone https://github.com/remoteclaw/remoteclaw.git
cd remoteclaw
pnpm install && pnpm ui:build && pnpm build
pnpm remoteclaw onboard --install-daemon
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Learn More

[Docs](https://docs.remoteclaw.org) · [Getting Started](https://docs.remoteclaw.org/start/getting-started) · [Configuration](https://docs.remoteclaw.org/gateway/configuration) · [Security](https://docs.remoteclaw.org/gateway/security) · [Architecture](https://docs.remoteclaw.org/concepts/architecture) · [Vision](VISION.md) · [FAQ](https://docs.remoteclaw.org/help/faq)

## Community

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and how to submit PRs. AI/vibe-coded PRs welcome!

Forked from [OpenClaw](https://github.com/openclaw/openclaw). See [upstream contributors](https://github.com/openclaw/openclaw/graphs/contributors).

[![Star History Chart](https://api.star-history.com/svg?repos=remoteclaw/remoteclaw&type=date&legend=top-left)](https://www.star-history.com/#remoteclaw/remoteclaw&type=date&legend=top-left)

## License

RemoteClaw is licensed under [AGPL-3.0-only](LICENSE).

This project incorporates code from [OpenClaw](https://github.com/openclaw/openclaw), originally licensed under the [MIT License](LICENSES/MIT.txt). If you prefer the MIT-licensed version, see the [upstream repository](https://github.com/openclaw/openclaw).
