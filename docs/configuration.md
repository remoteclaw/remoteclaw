---
title: "Configuration Reference"
---

# Configuration Reference

RemoteClaw is configured via a JSON5 file at `~/.remoteclaw/remoteclaw.json`.
JSON5 allows comments and trailing commas, making configuration more readable.

## Runtime Selection

The `agents.defaults.runtime` key selects which agent CLI powers RemoteClaw.
Claude is the default.

| Value      | CLI          | Notes           |
| ---------- | ------------ | --------------- |
| `claude`   | Claude Code  | Default runtime |
| `gemini`   | Gemini CLI   |                 |
| `codex`    | Codex CLI    |                 |
| `opencode` | OpenCode CLI |                 |

Set `runtime` under `agents.defaults`:

```json5
{
  agents: {
    defaults: {
      runtime: "claude",
    },
  },
}
```

Per-agent overrides are possible via `agents.list[].runtime`.

## API Key Configuration

Each runtime reads its API key from an environment variable:

| Runtime    | Environment Variable                              |
| ---------- | ------------------------------------------------- |
| `claude`   | `ANTHROPIC_API_KEY`                               |
| `gemini`   | `GEMINI_API_KEY` or `GOOGLE_API_KEY`              |
| `codex`    | `OPENAI_API_KEY`                                  |
| `opencode` | Provider-specific (depends on configured backend) |

Export the key in your shell profile or set it in `env.vars`:

```json5
{
  env: {
    vars: {
      ANTHROPIC_API_KEY: "sk-ant-...",
    },
  },
}
```

## Channel Setup

Channels connect RemoteClaw to messaging platforms.
Each channel is configured under `channels.<provider>`.

All channels share these common options:

| Key              | Type    | Default       | Description                                                  |
| ---------------- | ------- | ------------- | ------------------------------------------------------------ |
| `enabled`        | boolean | `true`        | Enable or disable the channel                                |
| `dmPolicy`       | string  | `"pairing"`   | DM access policy: `pairing`, `allowlist`, `open`, `disabled` |
| `groupPolicy`    | string  | `"allowlist"` | Group access policy: `allowlist`, `open`, `disabled`         |
| `allowFrom`      | array   | `[]`          | Sender allowlist for DMs (format varies by channel)          |
| `groupAllowFrom` | array   | `[]`          | Sender allowlist for groups                                  |
| `textChunkLimit` | number  | `4000`        | Max characters per message chunk                             |
| `mediaMaxMb`     | number  | varies        | Max media file size in MB                                    |

### Telegram

Requires a bot token from [@BotFather](https://core.telegram.org/bots#botfather).

```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    },
  },
}
```

The token can also come from the `TELEGRAM_BOT_TOKEN` environment variable.

Key Telegram-specific options:

| Key           | Type     | Default  | Description                                              |
| ------------- | -------- | -------- | -------------------------------------------------------- |
| `botToken`    | string   | required | Telegram bot API token                                   |
| `tokenFile`   | string   |          | Path to file containing the token (for secret managers)  |
| `allowFrom`   | number[] | `[]`     | Numeric Telegram user IDs                                |
| `streaming`   | string   | `"off"`  | Message streaming: `off`, `partial`, `block`, `progress` |
| `replyToMode` | string   | `"off"`  | Threading: `off`, `first`, `all`                         |

Multi-account setup uses the `accounts` key:

```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABC-...", // default account
      accounts: {
        alerts: {
          botToken: "789012:GHI-...",
        },
      },
    },
  },
}
```

### WhatsApp (Baileys)

WhatsApp uses QR-code authentication. Point `authDir` to a directory where
session files will be stored after scanning the QR code.

```json5
{
  channels: {
    whatsapp: {
      accounts: {
        default: {
          authDir: "~/.remoteclaw/whatsapp-auth",
        },
      },
    },
  },
}
```

Key WhatsApp-specific options:

| Key                | Type     | Default  | Description                                 |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `authDir`          | string   | required | Path to Baileys auth state directory        |
| `allowFrom`        | string[] | `[]`     | E.164 phone numbers (e.g., `"+1234567890"`) |
| `sendReadReceipts` | boolean  | `true`   | Send read receipts to senders               |
| `debounceMs`       | number   | `0`      | Batch rapid messages (0 = disabled)         |

### Slack

Requires both a bot token (`xoxb-`) and an app-level token (`xapp-`).

```json5
{
  channels: {
    slack: {
      botToken: "xoxb-...",
      appToken: "xapp-...",
    },
  },
}
```

Tokens can also come from `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` environment
variables.

Key Slack-specific options:

| Key               | Type     | Default    | Description                                          |
| ----------------- | -------- | ---------- | ---------------------------------------------------- |
| `botToken`        | string   | required   | Slack bot user token (`xoxb-`)                       |
| `appToken`        | string   | required   | Slack app-level token (`xapp-`)                      |
| `userToken`       | string   |            | Optional user token (`xoxp-`) for richer read access |
| `mode`            | string   | `"socket"` | Connection mode: `socket` or `http`                  |
| `requireMention`  | boolean  | `true`     | Require @mention in channels                         |
| `nativeStreaming` | boolean  | `true`     | Use Slack native streaming                           |
| `allowFrom`       | string[] | `[]`       | Slack user IDs                                       |

## MCP Server Configuration

Tool access is configured under `tools`:

```json5
{
  tools: {
    profile: "coding",
    allow: ["mcp__my-server__*"],
    deny: ["mcp__dangerous__*"],
  },
}
```

| Key                | Type     | Default | Description                                            |
| ------------------ | -------- | ------- | ------------------------------------------------------ |
| `tools.profile`    | string   |         | Tool profile: `minimal`, `coding`, `messaging`, `full` |
| `tools.allow`      | string[] |         | Allowlist of tool names (glob patterns supported)      |
| `tools.alsoAllow`  | string[] |         | Additional tools on top of the profile                 |
| `tools.deny`       | string[] |         | Denylist of tool names                                 |
| `tools.byProvider` | object   |         | Per-provider tool policies                             |

Tool policies can also be set per-agent in `agents.list[].tools` and
per-channel-group in `channels.<provider>.groups.<id>.tools`.

### File System and Execution

| Key                      | Type    | Description                           |
| ------------------------ | ------- | ------------------------------------- |
| `tools.fs.workspaceOnly` | boolean | Restrict file access to the workspace |
| `tools.exec.host`        | string  | Execution host                        |
| `tools.exec.security`    | object  | Execution security settings           |

## Session Management

Sessions track conversation state between the user and the agent.

```json5
{
  session: {
    scope: "per-sender",
    store: "~/.remoteclaw/sessions",
    maintenance: {
      pruneAfter: "30d",
    },
  },
}
```

| Key                                | Type          | Default        | Description                                                                          |
| ---------------------------------- | ------------- | -------------- | ------------------------------------------------------------------------------------ |
| `session.scope`                    | string        | `"per-sender"` | Session isolation: `per-sender` or `global`                                          |
| `session.dmScope`                  | string        | `"main"`       | DM session scope: `main`, `per-peer`, `per-channel-peer`, `per-account-channel-peer` |
| `session.store`                    | string        |                | Path to session storage directory                                                    |
| `session.reset`                    | object        |                | Auto-reset trigger configuration                                                     |
| `session.resetByType`              | object        |                | Per-chat-type reset rules (`direct`, `group`, `thread`)                              |
| `session.resetByChannel`           | object        |                | Per-channel reset rules                                                              |
| `session.maintenance.pruneAfter`   | duration      |                | Auto-prune sessions older than this                                                  |
| `session.maintenance.maxDiskBytes` | string/number |                | Max disk usage (e.g., `"5gb"`)                                                       |
| `session.threadBindings.enabled`   | boolean       |                | Enable thread-to-session mapping                                                     |
| `session.threadBindings.ttlHours`  | number        |                | Thread binding time-to-live                                                          |

## Cron Scheduling

Schedule periodic agent tasks with cron syntax:

```json5
{
  cron: {
    enabled: true,
    store: "~/.remoteclaw/cron",
    sessionRetention: "7d",
    maxConcurrentRuns: 2,
  },
}
```

| Key                      | Type         | Default | Description                                       |
| ------------------------ | ------------ | ------- | ------------------------------------------------- |
| `cron.enabled`           | boolean      |         | Enable cron scheduling                            |
| `cron.store`             | string       |         | Path to cron job storage                          |
| `cron.maxConcurrentRuns` | number       |         | Max concurrent cron executions                    |
| `cron.webhook`           | string       |         | Webhook URL for cron triggers (HTTPS only)        |
| `cron.webhookToken`      | string       |         | Authentication token for the webhook              |
| `cron.sessionRetention`  | string/false |         | How long to keep cron session logs (e.g., `"7d"`) |
| `cron.runLog.maxBytes`   | number       |         | Max size of the run log                           |
| `cron.runLog.keepLines`  | number       |         | Lines to keep in the run log                      |

## All Top-Level Keys

Every top-level key in `RemoteClawSchema` (from `src/config/zod-schema.ts`):

| Key           | Type   | Description                                                                                        |
| ------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `$schema`     | string | JSON Schema URL reference                                                                          |
| `meta`        | object | Version tracking (`lastTouchedVersion`, `lastTouchedAt`)                                           |
| `env`         | object | Environment: `shellEnv` (shell inheritance), `vars` (custom env vars)                              |
| `wizard`      | object | Setup wizard state tracking                                                                        |
| `diagnostics` | object | OpenTelemetry export, cache tracing, feature flags                                                 |
| `logging`     | object | Log level, file output, console style, sensitive field redaction                                   |
| `update`      | object | Auto-update channel (`stable`/`beta`/`dev`) and check settings                                     |
| `browser`     | object | Chrome DevTools Protocol automation, SSRF policy, browser profiles                                 |
| `ui`          | object | UI customization: theme color, assistant name and avatar                                           |
| `auth`        | object | Auth profiles (API key/OAuth/token) for gateway access control                                     |
| `nodeHost`    | object | Node host configuration (browser proxy)                                                            |
| `agents`      | object | Agent defaults and agent list (see [Agent Configuration](#agent-configuration))                    |
| `tools`       | object | Tool access profiles, allow/deny lists (see [MCP Server Configuration](#mcp-server-configuration)) |
| `messages`    | object | Message handling configuration                                                                     |
| `commands`    | object | Command parsing and execution                                                                      |
| `approvals`   | object | Tool and action approval workflow                                                                  |
| `session`     | object | Session management (see [Session Management](#session-management))                                 |
| `broadcast`   | object | Agent-to-agent broadcast routing                                                                   |
| `audio`       | object | Audio transcription command and timeout                                                            |
| `media`       | object | Media handling (e.g., `preserveFilenames`)                                                         |
| `cron`        | object | Scheduled jobs (see [Cron Scheduling](#cron-scheduling))                                           |
| `hooks`       | object | Webhook integration: mappings, Gmail Pub/Sub, internal events                                      |
| `web`         | object | WebSocket server (heartbeat, reconnect strategy)                                                   |
| `channels`    | object | Messaging channel adapters (see [Channel Setup](#channel-setup))                                   |
| `discovery`   | object | mDNS/Bonjour and wide-area discovery                                                               |
| `canvasHost`  | object | Visual workspace server (port, document root, live reload)                                         |
| `talk`        | object | Voice/TTS provider config and voice aliases                                                        |
| `gateway`     | object | Control plane (see [Gateway](#gateway))                                                            |
| `memory`      | any    | Opaque plugin memory store                                                                         |
| `plugins`     | object | Plugin system (see [Plugins](#plugins))                                                            |
| `bindings`    | array  | Channel-to-agent routing rules                                                                     |

## Agent Configuration

Configure agent defaults and define multiple agents:

```json5
{
  agents: {
    defaults: {
      runtime: "claude",
      workspace: "~/projects",
      contextTokens: 200000,
    },
    list: [
      {
        id: "main",
        default: true,
        name: "Main Agent",
      },
      {
        id: "ops",
        name: "Ops Agent",
        runtime: "gemini",
      },
    ],
  },
}
```

Key agent default options:

| Key                               | Type   | Description                                                 |
| --------------------------------- | ------ | ----------------------------------------------------------- |
| `agents.defaults.runtime`         | string | Default agent CLI (`claude`, `gemini`, `codex`, `opencode`) |
| `agents.defaults.workspace`       | string | Workspace root directory                                    |
| `agents.defaults.contextTokens`   | number | Context window size                                         |
| `agents.defaults.timeoutSeconds`  | number | Agent response timeout                                      |
| `agents.defaults.maxConcurrent`   | number | Max concurrent sessions                                     |
| `agents.defaults.typingMode`      | string | Typing indicator: `never`, `instant`, `thinking`, `message` |
| `agents.defaults.humanDelay.mode` | string | Simulated delay: `off`, `natural`, `custom`                 |

## Gateway

The gateway is the control plane that manages channels, agents, and API
endpoints:

```json5
{
  gateway: {
    port: 18789,
    mode: "local",
    auth: {
      mode: "token",
      token: "my-secret-token",
    },
  },
}
```

| Key                         | Type    | Default   | Description                                                  |
| --------------------------- | ------- | --------- | ------------------------------------------------------------ |
| `gateway.port`              | number  | `18789`   | Gateway listen port                                          |
| `gateway.mode`              | string  | `"local"` | Mode: `local` or `remote`                                    |
| `gateway.bind`              | string  | `"auto"`  | Bind address: `auto`, `lan`, `loopback`, `custom`, `tailnet` |
| `gateway.auth.mode`         | string  |           | Auth mode: `none`, `token`, `password`, `trusted-proxy`      |
| `gateway.auth.token`        | string  |           | Authentication token                                         |
| `gateway.tls.enabled`       | boolean |           | Enable TLS                                                   |
| `gateway.tls.certPath`      | string  |           | Path to TLS certificate                                      |
| `gateway.tls.keyPath`       | string  |           | Path to TLS private key                                      |
| `gateway.controlUi.enabled` | boolean |           | Enable the web control UI                                    |
| `gateway.tailscale.mode`    | string  | `"off"`   | Tailscale integration: `off`, `serve`, `funnel`              |
| `gateway.reload.mode`       | string  | `"off"`   | Hot reload: `off`, `restart`, `hot`, `hybrid`                |

## Plugins

The plugin system loads channel extensions and other add-ons:

```json5
{
  plugins: {
    enabled: true,
    allow: ["telegram", "whatsapp", "slack"],
    load: {
      paths: ["./extensions"],
    },
  },
}
```

| Key                            | Type     | Description                      |
| ------------------------------ | -------- | -------------------------------- |
| `plugins.enabled`              | boolean  | Enable the plugin system         |
| `plugins.allow`                | string[] | Plugin allowlist                 |
| `plugins.deny`                 | string[] | Plugin denylist                  |
| `plugins.load.paths`           | string[] | Directories to scan for plugins  |
| `plugins.entries.<id>.enabled` | boolean  | Enable/disable a specific plugin |
| `plugins.entries.<id>.config`  | object   | Plugin-specific configuration    |

## Deprecated Sections

The following configuration sections are deprecated and will be ignored or
removed in future versions:

### `skills`

**Status:** Removed.

The skills system has been removed. In the middleware rewrite, agent CLIs
(Claude, Gemini, Codex, OpenCode) bring their own capabilities. There is no
centralized skill marketplace. Any `skills` configuration is ignored.

### `models`

**Status:** Removed.

The model catalog has been removed. Each agent CLI manages its own model
selection. Any `models` configuration is ignored.

### `plugins` (partially deprecated)

**Status:** Kept for channel extensions only.

The plugin system remains active for loading channel adapter extensions
(Telegram, WhatsApp, Slack, etc.). However, the broader plugin ecosystem
(custom skills, model providers) is no longer supported. Plugins now serve
exclusively as channel adapters.
