# Middleware

This directory hosts the runtime-agnostic core that bridges messaging channels
to CLI agent backends. The hot path is `CLIRuntimeBase.execute()`
(`cli-runtime-base.ts`), which spawns a CLI subprocess (`claude`, `gemini`,
`codex`, or `opencode`) and translates its NDJSON stream into the
`AgentEvent` event vocabulary.

## CLI runtime metric vocabulary

`CLIRuntimeBase` emits structured metric lines via `logDebug` so spawn-lifecycle
behaviour can be inspected without a metrics backend. Each line has the shape:

```text
[agent-runtime] metric=<name> backend=<cmd> value=<n> [extra=...]
```

`<cmd>` is the CLI binary name (`claude`, `gemini`, `codex`, `opencode`).
Lines are intended to be grep-aggregatable; aggregation into a real metric
backend can be layered on later.

| Metric                   | Type      | Backends                | Emitted from                                                                                                 | What it captures                                                                                                                                                                                                  |
| ------------------------ | --------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cold_start_ms`          | Histogram | All                     | First NDJSON line on the configured `ndjsonStream` (`stdout` for Gemini/Codex/OpenCode, `stderr` for Claude) | Wall time from immediately before the `spawn()` syscall to the first NDJSON line. Includes process-creation cost; the CLI is "warm" once the first line arrives.                                                  |
| `inflight_subprocesses`  | Gauge     | All                     | Increment immediately before `spawn()`; decrement in the outer `finally` of `execute()`                      | Number of concurrent CLI subprocesses for this backend, shared across all runtime instances. Balanced on every termination path (normal completion, exception, generator break, abort).                           |
| `mcp_config_setup_ms`    | Histogram | Gemini, Codex, OpenCode | Per-runtime `*McpConfigManager.setup()` wrapped via `timedMcpSetup()`                                        | Time spent staging the per-runtime MCP config file (read existing + merge MCP sections + write).                                                                                                                  |
| `mcp_config_teardown_ms` | Histogram | Gemini, Codex, OpenCode | Per-runtime `*McpConfigManager.teardown()` wrapped via `timedMcpTeardown()`                                  | Time spent restoring the original MCP config file (or removing the file the manager created).                                                                                                                     |
| `subprocess_rss_mb`      | Gauge     | Gemini, Codex, OpenCode | Polled every `rssSampleIntervalMs` (default 5s) via `ps -o rss= -p <pid>` while the subprocess is in-flight  | Resident set size of the subprocess in MB. Includes a `pid=<n>` extra so multiple concurrent samples can be disambiguated. Excluded for Claude — its per-session 1-process-per-turn model has different topology. |

The existing `durationMs` total-turn time is unchanged and is still surfaced
on the `AgentDoneEvent.result.durationMs` field; the metrics above are
finer-grained signals about the spawn lifecycle itself.

### Adding new metrics

Use `this.emitMetric(name, value, extras?)` from `CLIRuntimeBase`. Keep
`<name>` lowercase-snake-case and append the unit when ambiguous (`*_ms`,
`*_mb`). Document the new metric in the table above before merging — the
table is the source of truth for what runtimes emit.

### Subscribing or disabling

Metric lines flow through the project's debug logger (`logDebug` in
`src/logger.ts`). They are emitted only when debug logging is enabled — no
hot-path overhead in production. To collect them, tail the verbose console
or the project log file.
