---
description: "Diagnostics flags for targeted debug logs"
read_when:
  - You need targeted debug logs without raising global logging levels
  - You need to capture subsystem-specific logs for support
title: "Diagnostics flags"
---

Diagnostics flags turn on extra logging for one subsystem without raising
`logging.level` globally. A flag has no effect unless a subsystem checks it.

## How it works

- Flags are case-insensitive strings, resolved from `diagnostics.flags` in
  config plus the `REMOTECLAW_DIAGNOSTICS` env override, deduped and lowercased.
- `name.*` matches `name` itself and anything under `name.` (for example
  `telegram.*` matches `telegram.http`).
- `*` or `all` enables every flag.
- Restart the gateway after changing `diagnostics.flags` in config; it is not
  hot-reloaded.

## Known flags

| Flag             | Enables                                                   |
| ---------------- | --------------------------------------------------------- |
| `telegram.http`  | Telegram Bot API HTTP error logging                       |
| `brave.http`     | Brave Search request/response/cache logging               |
| `profiler`       | Reply-stage profiler and Codex app-server profiler (both) |
| `reply.profiler` | Reply-stage profiler only                                 |
| `codex.profiler` | Codex app-server profiler only                            |
| `timeline`       | Structured JSONL timeline artifact (see below)            |

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

## Env override (one-off)

```bash
REMOTECLAW_DIAGNOSTICS=telegram.http,brave.http
```

Values split on commas or whitespace. Special values:

| Value                       | Effect                                   |
| --------------------------- | ---------------------------------------- |
| `0`, `false`, `off`, `none` | Disable all flags, overriding config too |
| `1`, `true`, `all`, `*`     | Enable every flag                        |

`REMOTECLAW_DIAGNOSTICS=0` disables flags from both env and config for that
process, useful for temporarily silencing a profiler flag left on in config
without editing the file.

## Profiler flags

Profiler flags gate lightweight timing spans; they add no overhead when off.

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

`profiler` enables both the reply profiler and the Codex profiler; use the
scoped flag names to enable just one.

Or set it in config:

```json
{
  "diagnostics": {
    "flags": ["reply.profiler", "codex.profiler"]
  }
}
```

Restart the gateway after changing config flags. To disable a profiler flag,
remove it from `diagnostics.flags` and restart, or start the process with
`REMOTECLAW_DIAGNOSTICS=0` to override every diagnostics flag for that run.

## Timeline artifacts

The `timeline` flag (alias: `diagnostics.timeline`) writes structured startup
and runtime timing events as JSONL, for external QA harnesses:

```bash
REMOTECLAW_DIAGNOSTICS=timeline \
REMOTECLAW_DIAGNOSTICS_TIMELINE_PATH=/tmp/remoteclaw-timeline.jsonl \
remoteclaw gateway run
```

Or enable it in config:

```json
{
  "diagnostics": {
    "flags": ["timeline"]
  }
}
```

The output path always comes from `REMOTECLAW_DIAGNOSTICS_TIMELINE_PATH`, even
when the flag itself is set in config; there is no config key for the path.
When `timeline` is enabled only from config, the earliest config-loading spans
are missing because RemoteClaw has not read config yet; subsequent startup spans
are captured normally.

`REMOTECLAW_DIAGNOSTICS=1`, `=all`, and `=*` also enable the timeline, since they
enable every flag. Prefer the scoped `timeline` flag when you only want the
JSONL artifact and not every other diagnostics flag.

Event-loop delay samples in the timeline need one more opt-in beyond
`timeline`: set `REMOTECLAW_DIAGNOSTICS_EVENT_LOOP=1` (or `on`/`true`/`yes`) on
top of enabling the timeline.

Timeline records use the `remoteclaw.diagnostics.v1` envelope and can include
process ids, phase names, span names, durations, plugin ids, dependency
counts, event-loop delay samples, provider operation names, child-process exit
state, and startup error names/messages. Treat timeline files as local
diagnostics artifacts; review before sharing them outside your machine.

## Where logs go

Flags emit logs into the standard diagnostics log file. By default:

```
/tmp/remoteclaw/remoteclaw-YYYY-MM-DD.log
```

If you set `logging.file`, use that path instead. Logs are JSONL (one JSON
object per line). Redaction still applies based on `logging.redactSensitive`.
See [Logging](/logging) for the full log-path resolution, rotation, and
redaction model.

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

For remote gateways, use `remoteclaw logs --follow` instead (see
[/cli/logs](/cli/logs)).

## Notes

- If `logging.level` is set higher than `warn`, flag-gated logs may be
  suppressed. Default `info` is fine.
- `brave.http` logs Brave Search request URLs/query params, response
  status/timing, and cache hit/miss/write events. It does not log the API key
  (sent as a request header) or response bodies, but search queries can be
  sensitive.
- Flags are safe to leave enabled; they only affect log volume for the
  specific subsystem.
- Use [/logging](/logging) to change log destinations, levels, and redaction.

## Related

- [Gateway diagnostics](/gateway/diagnostics)
- [Gateway troubleshooting](/gateway/troubleshooting)
