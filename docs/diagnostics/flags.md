---
description: "Diagnostics flags for targeted debug logs"
read_when:
  - You need targeted debug logs without raising global logging levels
  - You need to capture subsystem-specific logs for support
title: "Diagnostics flags"
---

Diagnostics flags let you enable targeted debug logs without turning on verbose logging everywhere. Flags are opt-in and have no effect unless a subsystem checks them.

## How it works

- Flags are strings (case-insensitive).
- You can enable flags in config or via an env override.
- Wildcards are supported:
  - `telegram.*` matches `telegram.http`
  - `*` enables all flags

## Enable via config

```json
{
  "diagnostics": {
    "flags": ["telegram.http"]
  }
}
```

Multiple flags:

```json
{
  "diagnostics": {
    "flags": ["telegram.http", "brave.http", "gateway.*"]
  }
}
```

Restart the gateway after changing flags.

## Env override (one-off)

```bash
REMOTECLAW_DIAGNOSTICS=telegram.http,telegram.payload
```

Disable all flags:

```bash
REMOTECLAW_DIAGNOSTICS=0
```

`REMOTECLAW_DIAGNOSTICS=0` is a process-level disable override: it disables
flags from both env and config for that process.

## Profiling flags

Profiler flags enable targeted timing spans without raising global logging
levels. They are disabled by default.

Enable all profiler-gated spans for one gateway run:

```bash
REMOTECLAW_DIAGNOSTICS=profiler remoteclaw gateway run
```

Enable only reply-dispatch profiler spans:

```bash
REMOTECLAW_DIAGNOSTICS=reply.profiler remoteclaw gateway run
```

Enable only Codex app-server startup/tool/thread profiler spans:

```bash
REMOTECLAW_DIAGNOSTICS=codex.profiler remoteclaw gateway run
```

Enable profiler flags from config:

```json
{
  "diagnostics": {
    "flags": ["reply.profiler", "codex.profiler"]
  }
}
```

Restart the gateway after changing config flags. To disable a profiler flag,
remove it from `diagnostics.flags` and restart. To temporarily disable every
diagnostics flag even when config enables profiler flags, start the process with:

```bash
REMOTECLAW_DIAGNOSTICS=0 remoteclaw gateway run
```

## Timeline artifacts

The `timeline` flag writes structured startup and runtime timing events for
external QA harnesses:

```bash
REMOTECLAW_DIAGNOSTICS=timeline \
REMOTECLAW_DIAGNOSTICS_TIMELINE_PATH=/tmp/remoteclaw-timeline.jsonl \
remoteclaw gateway run
```

You can also enable it in config:

```json
{
  "diagnostics": {
    "flags": ["timeline"]
  }
}
```

The timeline file path still comes from
`REMOTECLAW_DIAGNOSTICS_TIMELINE_PATH`. When `timeline` is enabled only from
config, the earliest config-loading spans are not emitted because RemoteClaw has
not read config yet; subsequent startup spans use the config flag.

`REMOTECLAW_DIAGNOSTICS=1`, `REMOTECLAW_DIAGNOSTICS=all`, and
`REMOTECLAW_DIAGNOSTICS=*` also enable the timeline because they enable every
diagnostics flag. Prefer `timeline` when you only want the JSONL timing
artifact.

Timeline records use the `remoteclaw.diagnostics.v1` envelope. Events can include
process ids, phase names, span names, durations, plugin ids, dependency counts,
event-loop delay samples, provider operation names, child-process exit state,
and startup error names/messages. Treat timeline files as local diagnostics
artifacts; review them before sharing outside your machine.

## Where logs go

Flags emit logs into the standard diagnostics log file. By default:

```
/tmp/remoteclaw/remoteclaw-YYYY-MM-DD.log
```

If you set `logging.file`, use that path instead. Logs are JSONL (one JSON object per line). Redaction still applies based on `logging.redactSensitive`.

## Extract logs

Pick the latest log file:

```bash
ls -t /tmp/remoteclaw/remoteclaw-*.log | head -n 1
```

Filter for Telegram HTTP diagnostics:

```bash
rg "telegram http error" /tmp/remoteclaw/remoteclaw-*.log
```

Filter for Brave Search HTTP diagnostics:

```bash
rg "brave http" /tmp/remoteclaw/remoteclaw-*.log
```

Or tail while reproducing:

```bash
tail -f /tmp/remoteclaw/remoteclaw-$(date +%F).log | rg "telegram http error"
```

For remote gateways, you can also use `remoteclaw logs --follow` (see [/cli/logs](/cli/logs)).

## Notes

- If `logging.level` is set higher than `warn`, these logs may be suppressed. Default `info` is fine.
- `brave.http` logs Brave Search request URLs/query params, response status/timing, and cache hit/miss/write events. It does not log API keys or response bodies, but search queries can be sensitive.
- Flags are safe to leave enabled; they only affect log volume for the specific subsystem.
- Use [/logging](/logging) to change log destinations, levels, and redaction.

## Related

- [Gateway diagnostics](/gateway/diagnostics)
- [Gateway troubleshooting](/gateway/troubleshooting)
