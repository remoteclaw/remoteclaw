---
summary: "Debugging tools: watch mode, raw model streams, and tracing reasoning leakage"
read_when:
  - You need to inspect raw model output for reasoning leakage
  - You want to run the Gateway in watch mode while iterating
  - You need a repeatable debugging workflow
title: "Debugging"
---

# Debugging

This page covers debugging helpers for streaming output, especially when a
provider mixes reasoning into normal text.

## Runtime debug overrides

Use `/debug` in chat to set **runtime-only** config overrides (memory, not disk).
`/debug` is disabled by default; enable with `commands.debug: true`.
This is handy when you need to toggle obscure settings without editing `remoteclaw.json`.

Examples:

```
/debug show
/debug set messages.responsePrefix="[remoteclaw]"
/debug unset messages.responsePrefix
/debug reset
```

`/debug reset` clears all overrides and returns to the on-disk config.

## Gateway watch mode

For fast iteration, run the gateway under the file watcher:

```bash
pnpm gateway:watch
```

This maps to:

```bash
node --watch-path src --watch-path tsconfig.json --watch-path package.json --watch-preserve-output scripts/run-node.mjs gateway --force
```

Add any gateway CLI flags after `gateway:watch` and they will be passed through
on each restart.

## Dev profile + dev gateway (--dev)

Use the dev profile to isolate state and spin up a safe, disposable setup for
debugging. There are **two** `--dev` flags:

- **Global `--dev` (profile):** isolates state under `~/.remoteclaw-dev` and
  defaults the gateway port to `19001` (derived ports shift with it).
- **`gateway --dev`: tells the Gateway to auto-create a default config +
  workspace** when missing.

Recommended flow (dev profile + dev bootstrap):

```bash
pnpm gateway:dev
REMOTECLAW_PROFILE=dev remoteclaw tui
```

If you don’t have a global install yet, run the CLI via `pnpm remoteclaw ...`.

What this does:

1. **Profile isolation** (global `--dev`)
   - `REMOTECLAW_PROFILE=dev`
   - `REMOTECLAW_STATE_DIR=~/.remoteclaw-dev`
   - `REMOTECLAW_CONFIG_PATH=~/.remoteclaw-dev/remoteclaw.json`
   - `REMOTECLAW_GATEWAY_PORT=19001` (browser/canvas shift accordingly)

2. **Dev bootstrap** (`gateway --dev`)
   - Writes a minimal config if missing (`gateway.mode=local`, bind loopback).
   - Sets `agent.workspace` to the dev workspace.
   - Creates the workspace directory if missing.
   - Default identity: **C3‑PO** (protocol droid).
   - Skips channel providers in dev mode (`REMOTECLAW_SKIP_CHANNELS=1`).

Reset flow (fresh start):

```bash
pnpm gateway:dev:reset
```

Note: `--dev` is a **global** profile flag and gets eaten by some runners.
If you need to spell it out, use the env var form:

```bash
REMOTECLAW_PROFILE=dev remoteclaw gateway --dev --reset
```

`--reset` wipes config, credentials, sessions, and the dev workspace (using
`trash`, not `rm`), then recreates the default dev setup.

Tip: if a non‑dev gateway is already running (launchd/systemd), stop it first:

```bash
remoteclaw gateway stop
```

## Raw stream logging (RemoteClaw)

RemoteClaw can log the **raw assistant stream** before any filtering/formatting.
This is the best way to see whether reasoning is arriving as plain text deltas
(or as separate thinking blocks).

Enable it via CLI:

```bash
pnpm gateway:watch --raw-stream
```

Optional path override:

```bash
pnpm gateway:watch --raw-stream --raw-stream-path ~/.remoteclaw/logs/raw-stream.jsonl
```

Equivalent env vars:

```bash
REMOTECLAW_RAW_STREAM=1
REMOTECLAW_RAW_STREAM_PATH=~/.remoteclaw/logs/raw-stream.jsonl
```

Default file:

`~/.remoteclaw/logs/raw-stream.jsonl`

## Safety notes

- Raw stream logs can include full prompts, tool output, and user data.
- Keep logs local and delete them after debugging.
- If you share logs, scrub secrets and PII first.
