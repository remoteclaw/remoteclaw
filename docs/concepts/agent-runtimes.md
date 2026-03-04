# Agent Runtimes

RemoteClaw runs CLI agents as subprocesses. Each agent has a **runtime** that
handles subprocess lifecycle, parses the CLI's native output format, and
translates events into a unified stream.

## The AgentRuntime Interface

Every runtime implements a single method:

```typescript
interface AgentRuntime {
  execute(params: AgentExecuteParams): AsyncIterable<AgentEvent>;
}
```

`execute()` spawns the CLI process and returns an async iterable of events.
Callers consume events as they arrive — there is no buffering of the full
response.

### Execute Parameters

| Parameter          | Type                               | Purpose                                    |
| ------------------ | ---------------------------------- | ------------------------------------------ |
| `prompt`           | `string`                           | Full prompt text (system + user message)   |
| `sessionId`        | `string?`                          | CLI session ID for conversation resumption |
| `mcpServers`       | `Record<string, McpServerConfig>?` | MCP tool servers to expose                 |
| `abortSignal`      | `AbortSignal?`                     | Cancellation support                       |
| `workingDirectory` | `string?`                          | Subprocess working directory               |
| `env`              | `Record<string, string>?`          | Extra environment variables                |

### The Event Stream

Events form a discriminated union. Every execution ends with exactly one
`done` event:

| Event         | Key Fields                     | Purpose                             |
| ------------- | ------------------------------ | ----------------------------------- |
| `text`        | `text`                         | Streaming text delta from the agent |
| `tool_use`    | `toolName`, `toolId`, `input`  | Agent invoked an MCP tool           |
| `tool_result` | `toolId`, `output`, `isError?` | Tool returned a result              |
| `error`       | `message`, `code?`             | Runtime or subprocess error         |
| `done`        | `result: AgentRunResult`       | Terminal event with run summary     |

The `done` event carries an `AgentRunResult` with accumulated text, the
session ID for the next invocation, duration, token usage, cost, and stop
reason.

## CLIRuntimeBase — Subprocess Machinery

All four runtimes extend `CLIRuntimeBase`, which handles subprocess lifecycle
through a template method pattern. Subclasses implement three methods:

| Method               | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `buildArgs(params)`  | Construct CLI command-line arguments       |
| `buildEnv(params)`   | Construct environment variables            |
| `extractEvent(line)` | Parse one NDJSON line into an `AgentEvent` |

Two properties control I/O behavior:

| Property              | Default    | Purpose                                         |
| --------------------- | ---------- | ----------------------------------------------- |
| `supportsStdinPrompt` | `true`     | Whether to deliver large prompts via stdin      |
| `ndjsonStream`        | `"stdout"` | Which file descriptor carries structured events |

### Subprocess Lifecycle

When `execute()` is called:

1. **Spawn**: The CLI process starts with full stdio pipes (stdin, stdout,
   stderr).

2. **Stream selection**: The `ndjsonStream` property determines which file
   descriptor carries NDJSON events. The other stream is captured as
   diagnostic output.

3. **NDJSON parsing**: Lines from the selected stream are parsed as JSON.
   Valid JSON lines are passed to `extractEvent()`, which returns an
   `AgentEvent` or `null` (to skip the line).

4. **Stdin prompt delivery**: If `supportsStdinPrompt` is true and the prompt
   exceeds 10 KB, it is written to stdin. `stdin.end()` is always called so
   CLIs that block on stdin receive EOF.

5. **Event yielding**: Events are pushed into a queue and yielded to the
   caller via async iteration.

6. **Termination**: After the process exits, any final events (watchdog
   errors, abort markers) are emitted, followed by the `done` event.

### Watchdog Timer

A 5-minute inactivity watchdog resets on every NDJSON line received. If no
output arrives within the timeout, the runtime triggers process termination
and emits an error event with code `WATCHDOG_TIMEOUT`.

### Signal Escalation

Process termination (from watchdog, abort signal, or errors) follows a
two-step escalation:

1. **SIGTERM** — gives the CLI process a chance to clean up
2. **SIGKILL** (after 1.5 seconds) — forces termination if SIGTERM is ignored

### Per-Execution State Reset

Each concrete runtime resets its internal state before every `execute()` call.
This makes runtime instances reusable across multiple invocations without
reconstruction.

## CLI Runtimes

### Claude

| Aspect             | Detail                                           |
| ------------------ | ------------------------------------------------ |
| Command            | `claude --output-format stream-json --verbose`   |
| Structured output  | Stream JSON events on stdout                     |
| Session resumption | `--resume <sessionId>`                           |
| MCP config         | Inline via `--mcp-config '{"mcpServers":{...}}'` |
| Stdin prompt       | Supported (prompts over 10 KB)                   |

Claude emits a content block streaming protocol. Text arrives as
`content_block_delta` events with `text_delta` payloads. Tool use is
assembled across multiple events: `content_block_start` begins a tool buffer,
`content_block_delta` events with `input_json_delta` accumulate the input
JSON, and `content_block_stop` triggers parsing and emission of the complete
`tool_use` event.

Token usage and cost are captured from `result` events at the end of a run.

### Gemini

| Aspect             | Detail                                                 |
| ------------------ | ------------------------------------------------------ |
| Command            | `gemini --output-format stream-json --prompt <prompt>` |
| Structured output  | Flat NDJSON events on stdout                           |
| Session resumption | `--resume <sessionId>`                                 |
| MCP config         | File-based merge-restore of `.gemini/settings.json`    |
| Stdin prompt       | Not supported                                          |

Gemini emits flat events: `message` (with text content), `tool_use`, and
`tool_result` as complete, self-contained events. No streaming assembly is
needed.

Since the Gemini CLI lacks a flag for MCP server configuration, the runtime
uses a merge-restore pattern: it reads the existing `.gemini/settings.json`,
backs up the original content, merges in the MCP server entries, runs the
CLI, and restores the original file in a `finally` block.

### Codex

| Aspect             | Detail                                             |
| ------------------ | -------------------------------------------------- |
| Command            | `codex exec --json --color never <prompt>`         |
| Structured output  | Two-level event hierarchy on stdout                |
| Session resumption | `codex exec resume --json <sessionId> <prompt>`    |
| MCP config         | File-based merge-restore of `~/.codex/config.toml` |
| Stdin prompt       | Not supported                                      |

Codex has the most complex event model. Top-level events (`thread.started`,
`item.started`, `item.updated`, `item.completed`, `turn.completed`) contain
nested item types (`agent_message`, `command_execution`, `mcp_tool_call`,
etc.).

Text arrives incrementally: `item.updated` events carry cumulative text, and
the runtime tracks the last emitted length to compute and yield only the
delta.

The MCP config merge-restore targets the global `~/.codex/config.toml` file,
using a custom TOML serializer (no external TOML dependency).

### OpenCode

| Aspect             | Detail                                              |
| ------------------ | --------------------------------------------------- |
| Command            | `opencode run --format json <prompt>`               |
| Structured output  | Envelope events with `part` field on stdout         |
| Session resumption | `--session <sessionId>`                             |
| MCP config         | File-based merge-restore of `.opencode/config.json` |
| Stdin prompt       | Supported (default)                                 |

OpenCode wraps events in an envelope containing `type`, `timestamp`, and
`sessionID`. The actual event data is in a `part` field.

A notable pattern: OpenCode emits tool use and tool result in the same NDJSON
line. The runtime yields the `tool_use` event first, then buffers the
`tool_result` in a pending queue that drains after each base event yield.
This preserves the expected `tool_use` followed by `tool_result` ordering.

## MCP Configuration Patterns

CLI agents receive MCP server configuration so they can access RemoteClaw's
gateway tools (messaging, cron, etc.). Each CLI has a different mechanism:

| CLI      | Method        | File Modified                     | Cleanup          |
| -------- | ------------- | --------------------------------- | ---------------- |
| Claude   | CLI flag      | None (inline argument)            | None needed      |
| Gemini   | Merge-restore | `.gemini/settings.json` (workdir) | Restore original |
| Codex    | Merge-restore | `~/.codex/config.toml` (global)   | Restore original |
| OpenCode | Merge-restore | `.opencode/config.json` (workdir) | Restore original |

The merge-restore pattern (used by Gemini, Codex, and OpenCode) follows a
consistent lifecycle:

1. Read the existing config file (if any)
2. Save the original content
3. Merge MCP server entries into the config
4. Write the modified config
5. Run the CLI
6. Restore the original content in a `finally` block

Each manager tracks whether it created the file or directory, ensuring
cleanup does not remove pre-existing user configuration.

## Runtime Selection

`createCliRuntime(provider)` maps a provider string (`"claude"`, `"gemini"`,
`"codex"`, or `"opencode"`) to the corresponding runtime class. The provider
is normalized to lowercase before matching.
