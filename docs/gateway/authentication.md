---
description: "CLI agent authentication: API keys and setup-token on the gateway host"
read_when:
  - Debugging CLI agent auth issues
  - Documenting authentication or credential setup
title: "Authentication"
---

# Authentication

RemoteClaw is middleware — it spawns CLI agents (Claude, Gemini, Codex, OpenCode)
as subprocesses. Each CLI agent manages its own credentials. RemoteClaw's job is
to ensure the gateway host environment exposes the right credentials so the CLI
agent can authenticate when spawned.

## Recommended Anthropic setup (API key)

If you're using Anthropic directly, use an API key.

1. Create an API key in the Anthropic Console.
2. Put it on the **gateway host** (the machine running `remoteclaw gateway`).

```bash
export ANTHROPIC_API_KEY="..."
```

3. If the Gateway runs under systemd/launchd, prefer putting the key in
   `~/.remoteclaw/.env` so the daemon can read it:

```bash
cat >> ~/.remoteclaw/.env <<'EOF'
ANTHROPIC_API_KEY=...
EOF
```

Then restart the daemon (or restart your Gateway process) and verify the CLI
agent can authenticate:

```bash
claude --version   # confirm Claude CLI is available
remoteclaw doctor
```

See [Help](/help) for details on env inheritance (`env.shellEnv`,
`~/.remoteclaw/.env`, systemd/launchd).

## Anthropic: setup-token (subscription auth)

For Anthropic, the recommended path is an **API key**. If you're using a Claude
subscription, the setup-token flow is also supported. Run it on the **gateway host**:

```bash
claude setup-token
```

This stores the token in the Claude CLI's own config. RemoteClaw does not ingest
or manage CLI agent tokens — the Claude CLI reads its own credential store when
spawned.

If you see an Anthropic error like:

```
This credential is only authorized for use with Claude Code and cannot be used for other API requests.
```

…use an Anthropic API key instead.

> `claude setup-token` requires an interactive TTY.

## Checking auth status

Verify the CLI agent's own credential state by running the CLI interactively on
the gateway host:

```bash
claude         # confirm Claude CLI authenticates
remoteclaw doctor
```

## Troubleshooting

### "No credentials found"

Run `claude setup-token` on the **gateway host**, or set `ANTHROPIC_API_KEY` in
the gateway environment, then verify:

```bash
remoteclaw doctor
```

### Token expiring/expired

Rerun `claude setup-token` on the gateway host. The Claude CLI manages its own
token lifecycle.

## Requirements

- Claude Max or Pro subscription (for `claude setup-token`)
- Claude Code CLI installed (`claude` command available)
