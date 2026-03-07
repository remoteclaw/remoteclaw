---
title: "ChannelBridge"
---

# ChannelBridge

The ChannelBridge is the central orchestrator of RemoteClaw's middleware
layer. It receives a normalized message from a channel adapter, runs it
through a CLI agent subprocess, and returns deliverable response payloads.

## Overview

```
Channel Adapter
      │
      ▼
ChannelBridge.handle(message, callbacks?, abortSignal?)
      │
      ├── 1. Session lookup
      ├── 2. System prompt construction
      ├── 3. MCP server + temp directory setup
      ├── 4. Pre-spawn hooks
      ├── 5. Runtime execution (subprocess)
      ├── 6. Delivery processing (chunking + streaming)
      ├── 7. Error classification
      ├── 8. Side effect collection
      ├── 9. Session state update
      └── 10. Post-exit hooks
      │
      ▼
AgentDeliveryResult { payloads, run, mcp, error? }
```

## The handle() Pipeline

### Step 1 — Session Lookup

The bridge builds a session key from `channelId`, `from` (user ID), and
`replyToId` (thread ID), then queries the `SessionMap` for an existing CLI
session ID. If found, the session is resumed on the next CLI invocation.

The `SessionMap` is a file-backed store (`remoteclaw-sessions.json`) that
maps session keys to CLI session IDs with a 7-day TTL. Reads and writes go
directly to disk (no in-memory cache), and writes use atomic rename for
POSIX safety.

### Step 2 — System Prompt Construction

`buildSystemPrompt()` assembles a structured markdown prompt with these
sections:

| Section        | Content                                                              |
| -------------- | -------------------------------------------------------------------- |
| Identity       | "You are running inside RemoteClaw..." with channel and user context |
| Safety         | Human oversight rules, no credential exposure                        |
| Messaging      | Session routing, cross-session messaging via `sessions_send()`       |
| Reply tags     | `[[reply_to_current]]` and `[[reply_to:<id>]]` syntax                |
| Silent replies | `SILENT_REPLY_TOKEN` for when the agent has nothing to say           |
| Runtime        | Channel name, timezone, agent metadata                               |
| Workspace      | Working directory and file operations guidance                       |

Conditional sections are included when relevant data is present: message
formatting hints, authorized sender lists, and emoji reaction guidance.

### Step 3 — MCP Server and Temp Directory

A temporary directory is created for the invocation. Within it, a side
effects file path is generated for IPC with the MCP server.

The bridge builds an MCP server configuration that injects RemoteClaw's own
MCP server into the subprocess:

```
remoteclaw MCP server (injected into every CLI subprocess)
├── Gateway URL + token (for WebSocket access)
├── Session key (channelId:userId:threadId)
├── Side effects file path (for IPC)
├── Channel metadata (provider, account, sender info)
└── Tool profile (full/limited)
```

This MCP server gives the CLI agent access to RemoteClaw-specific tools:
sending messages to other channels, scheduling cron jobs, and accessing
gateway resources.

### Step 4 — Pre-Spawn Hooks

If `before_runtime_spawn` hooks are registered, they run before the
subprocess starts. Extensions can use these hooks to override the working
directory or inject additional environment variables.

### Step 5 — Runtime Execution

The bridge creates the appropriate runtime via `createCliRuntime(provider)`
and calls `execute()` with the assembled prompt, session ID, MCP
configuration, abort signal, working directory, and environment.

The full prompt passed to the runtime concatenates: system prompt + extra
context (if present) + user message text.

The event stream is wrapped in a `captureResult()` helper that intercepts
`done` and `error` events to capture their data while passing all events
through unchanged.

### Step 6 — Delivery Processing

The `DeliveryAdapter` consumes the event stream and produces
channel-deliverable payloads.

**Text chunking**: Text events accumulate in a buffer. When the buffer
exceeds the chunk limit (default 4000 characters), it splits at the best
available boundary:

1. Paragraph break (`\n\n`) — preferred
2. Line break (`\n`)
3. Word boundary (space)
4. Hard split at the limit — last resort

**Code fence awareness**: If a split occurs inside an unclosed markdown code
fence, the adapter closes the fence in the current chunk and reopens it in
the next. This prevents broken code blocks in multi-chunk messages.

**Streaming callbacks**: Overflow chunks trigger `onPartialReply` for
real-time streaming delivery. The final text block triggers `onBlockReply`
on the `done` event. Tool results trigger `onToolResult`.

### Step 7 — Error Classification

If the runtime throws synchronously, the error message is classified into
one of five categories:

| Category           | Matches                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `retryable`        | Rate limits (429), 503, overloaded, network errors (ETIMEDOUT, ECONNRESET) |
| `context_overflow` | Context length/window exceeded, too many tokens                            |
| `fatal` (auth)     | 401, 403, unauthorized, forbidden, invalid key                             |
| `fatal` (other)    | Default for unmatched errors                                               |
| `timeout`          | Timeout patterns                                                           |
| `aborted`          | Abort signal triggered                                                     |

Classification uses first-match-wins against pattern arrays.

### Step 8 — Side Effect Collection

After the subprocess exits, the bridge reads the side effects file written by
the MCP server during execution. Side effects are aggregated into:

- **Sent texts**: Messages the agent sent to other channels
- **Sent media URLs**: Media delivered through messaging tools
- **Sent targets**: Destination metadata (tool, provider, account, recipient)
- **Cron additions**: Scheduled jobs the agent created

The side effects file uses NDJSON format, written by the MCP server process
and read by the bridge — a clean file-based IPC channel that requires no
shared memory or sockets.

### Step 9 — Session State Update

If the CLI run produced a session ID (in the `done` event's `AgentRunResult`),
the bridge persists it to the `SessionMap`. The next message from the same
user in the same channel/thread will resume this session.

### Step 10 — Post-Exit Hooks

Two hooks fire after the subprocess exits (both fire-and-forget):

- `after_runtime_exit`: receives stdout, stderr, and side effects data
- `agent_end`: receives run ID, success status, and duration

The temporary directory created in step 3 is cleaned up in a `finally` block.

## The Delivery Result

`handle()` returns an `AgentDeliveryResult` with three parts:

| Field      | Type             | Content                                              |
| ---------- | ---------------- | ---------------------------------------------------- |
| `payloads` | `ReplyPayload[]` | Channel-deliverable message chunks                   |
| `run`      | `AgentRunResult` | CLI subprocess summary (text, usage, cost, duration) |
| `mcp`      | `McpSideEffects` | Gateway side effects (messages sent, crons added)    |
| `error`    | `string?`        | Error message if the run failed                      |

## Message Flow

A typical message flows through the system like this:

```
User sends "Hello" on Telegram
      │
      ▼
Telegram adapter normalizes to ChannelMessage
      │
      ▼
ChannelBridge.handle()
  ├── SessionMap: no existing session
  ├── System prompt: builds identity + safety + messaging sections
  ├── MCP config: injects remoteclaw MCP server
  ├── Runtime: spawns `claude --output-format stream-json ...`
  │     ├── stdin: prompt (if >10 KB)
  │     ├── stdout: NDJSON events streamed back
  │     │     ├── text "Hi! How can I help?" → DeliveryAdapter buffers
  │     │     └── done { sessionId: "abc-123", usage: {...} }
  │     └── process exits
  ├── Side effects file: empty (no gateway tools used)
  ├── SessionMap: stores "abc-123" for next message
  └── Returns AgentDeliveryResult
      │
      ▼
Telegram adapter sends "Hi! How can I help?" to user
```

## Cross-Channel Routing

The MCP server injected into every subprocess exposes a `sessions_send()`
tool. This allows the CLI agent to send messages to other channels or users
through the gateway, enabling cross-channel workflows.

For example, an agent receiving a message on Telegram can send a notification
to a Slack channel, or forward information to another user on WhatsApp.
The side effects system tracks all messages sent through this mechanism.

## Followup Handling

When a user sends a new message while the agent is still processing a
previous one, the message is queued as a followup. The queue mode determines
behavior — see [Sessions](session.md) for queue mode details.
