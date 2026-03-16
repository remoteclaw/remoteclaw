---
description: "CLI reference for `remoteclaw onboard` (interactive onboarding wizard)"
read_when:
  - You want guided setup for gateway, workspace, auth, channels, and agent runtime
title: "onboard"
---

# `remoteclaw onboard`

Interactive onboarding wizard for gateway, workspace, and agent runtime setup.

## Examples

```bash
remoteclaw onboard
remoteclaw onboard --flow quickstart
remoteclaw onboard --flow manual
remoteclaw onboard --mode remote --remote-url wss://gateway-host:18789
```

For plaintext private-network `ws://` targets (trusted networks only), set
`REMOTECLAW_ALLOW_INSECURE_PRIVATE_WS=1` in the onboarding process environment.

Non-interactive with auth token:

```bash
remoteclaw onboard --non-interactive \
  --runtime claude \
  --auth-token "$CLAUDE_CODE_OAUTH_TOKEN" \
  --accept-risk
```

Non-interactive custom provider:

```bash
remoteclaw onboard --non-interactive \
  --auth-choice custom-api-key \
  --custom-base-url "https://llm.example.com/v1" \
  --custom-model-id "foo-large" \
  --custom-api-key "$CUSTOM_API_KEY" \
  --custom-compatibility openai \
  --accept-risk
```

## Options

### Wizard flow

- `--flow <flow>`: Wizard flow (`quickstart` | `advanced` | `manual`)
  - `quickstart`: minimal prompts, auto-generates a gateway token
  - `manual` / `advanced`: full prompts for port, bind, auth
- `--mode <mode>`: Wizard mode (`local` | `remote`)
- `--runtime <runtime>`: Agent runtime (`claude` | `gemini` | `codex` | `opencode`)
- `--workspace <dir>`: Agent workspace directory (default: `~/.remoteclaw/workspace`)
- `--reset`: Reset config, credentials, sessions, and workspace before running wizard
- `--non-interactive`: Run without prompts
- `--accept-risk`: Acknowledge that agents are powerful and full system access is risky (required for `--non-interactive`)

### Gateway

- `--gateway-port <port>`: Gateway port
- `--gateway-bind <mode>`: Gateway bind (`loopback` | `tailnet` | `lan` | `auto` | `custom`)
- `--gateway-auth <mode>`: Gateway auth (`token` | `password`)
- `--gateway-token <token>`: Gateway token (token auth)
- `--gateway-password <password>`: Gateway password (password auth)

### Remote mode

- `--remote-url <url>`: Remote Gateway WebSocket URL
- `--remote-token <token>`: Remote Gateway token

### Tailscale

- `--tailscale <mode>`: Tailscale mode (`off` | `serve` | `funnel`)
- `--tailscale-reset-on-exit`: Reset tailscale serve/funnel on exit

### Service

- `--install-daemon`: Install gateway service
- `--no-install-daemon` / `--skip-daemon`: Skip gateway service install
- `--daemon-runtime <runtime>`: Daemon runtime (`node` | `bun`)

### Skip steps

- `--skip-channels`: Skip channel setup
- `--skip-skills`: Skip skills setup
- `--skip-health`: Skip health check
- `--skip-ui`: Skip Control UI/TUI prompts

### Output

- `--json`: Output JSON summary
- `--node-manager <name>`: Node manager for skills (`npm` | `pnpm` | `bun`)

## Flow notes

- Fastest first chat: `remoteclaw dashboard` (Control UI, no channel setup needed).
- Local onboarding auto-creates a DM scope for your workspace.

## Common follow-up commands

```bash
remoteclaw configure
remoteclaw agents add <name>
```

<Note>
`--json` does not imply non-interactive mode. Use `--non-interactive` for scripts.
</Note>
