---
description: "Complete reference for all 51 MCP tools across 9 handler groups"
read_when:
  - Implementing or debugging MCP tool calls
  - Understanding which tools are available to agents
title: "MCP Tool Reference"
---

# MCP Tool Reference

RemoteClaw exposes **51 MCP tools** across **9 handler groups**. These tools
allow CLI agents (Claude, Gemini, Codex, OpenCode) to interact with RemoteClaw
infrastructure: session management, cross-channel messaging, heartbeat
reporting, cron scheduling, gateway administration, paired-node execution,
canvas collaboration, browser proxy, and text-to-speech.

RemoteClaw only provides tools that **require RemoteClaw infrastructure**.
Generic capabilities (web search, file I/O, shell exec) are left to each CLI
agent's own MCP ecosystem.

---

## Permission Model

Tools are divided into two permission tiers based on the `senderIsOwner` flag
(set via `REMOTECLAW_SENDER_IS_OWNER=true`):

| Tier           | Groups                                     | Tool Count | Access     |
| -------------- | ------------------------------------------ | ---------- | ---------- |
| **Baseline**   | Session, Message, Heartbeat                | 18         | All agents |
| **Owner-only** | Cron, Gateway, Nodes, Canvas, Browser, TTS | 33         | Owner only |

Owner-only tools are not registered at all for non-owner sessions, so they do
not appear in the agent's tool list.

**Plugin tools** are always registered (availability depends on gateway plugin
configuration).

---

## Lifecycle

The MCP server runs as a **per-invocation stdio process**
(`src/middleware/mcp-server.ts`). Each agent run spawns a fresh instance, which:

1. Reads context from environment variables set by ChannelBridge
2. Registers tools via `registerAllTools` (`src/middleware/mcp-tools.ts`)
3. Wraps every tool with before/after hook firing (fire-and-forget gateway RPC)
4. Connects via `StdioServerTransport`

**Hook wrapper**: Every tool invocation fires `hooks.tool.before` (with
`{ toolName, params }`) and `hooks.tool.after` (with
`{ toolName, params, durationMs, error? }`) via gateway RPC. Both are
fire-and-forget. On unhandled errors, the wrapper returns
`{ isError: true, content: [{ type: "text", text: "Tool error (name): ..." }] }`.

**Gateway transport**: All tools call the gateway using least-privilege operator
scopes, 30-second timeout, and `mode: BACKEND`.

**Side effects**: Tools that send messages or create cron jobs write NDJSON
records to `REMOTECLAW_SIDE_EFFECTS_FILE`.

**Return format**: All tools return
`{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }` where
`result` is the gateway's JSON response. Individual tool sections below note
return shapes only when they differ from or extend this default.

---

## Context

Every tool handler receives a shared `McpHandlerContext` populated from
environment variables:

| Field           | Env Var                        | Description                           |
| --------------- | ------------------------------ | ------------------------------------- |
| `gatewayUrl`    | `REMOTECLAW_GATEWAY_URL`       | Gateway WebSocket URL                 |
| `gatewayToken`  | `REMOTECLAW_GATEWAY_TOKEN`     | Gateway auth token                    |
| `sessionKey`    | `REMOTECLAW_SESSION_KEY`       | Current session key                   |
| `sideEffects`   | `REMOTECLAW_SIDE_EFFECTS_FILE` | NDJSON side-effects writer            |
| `channel`       | `REMOTECLAW_CHANNEL`           | Originating channel (e.g. `telegram`) |
| `accountId`     | `REMOTECLAW_ACCOUNT_ID`        | Originating account ID                |
| `to`            | `REMOTECLAW_TO`                | Delivery target                       |
| `threadId`      | `REMOTECLAW_THREAD_ID`         | Thread/topic ID                       |
| `senderIsOwner` | `REMOTECLAW_SENDER_IS_OWNER`   | Whether sender is bot owner           |
| `toolProfile`   | `REMOTECLAW_TOOL_PROFILE`      | Tool profile (default: `full`)        |

---

## Session Tools (7 tools)

**Source**: `src/middleware/mcp-handlers/session.ts`
**Permission**: All agents

### `sessions_list`

List active sessions with optional filters.

| Parameter | Type   | Required | Description                                     |
| --------- | ------ | -------- | ----------------------------------------------- |
| `filter`  | string | no       | Search string; when set, `limit` is ignored     |
| `limit`   | number | no       | Max results (only used when `filter` is absent) |

Always includes global and unknown sessions in results.

### `sessions_history`

Get chat history for a session.

| Parameter    | Type   | Required | Description            |
| ------------ | ------ | -------- | ---------------------- |
| `sessionKey` | string | yes      | Target session key     |
| `limit`      | number | no       | Max messages to return |

### `sessions_send`

Send a message to another session. Use `sessionKey` or `label` to identify the
target.

| Parameter    | Type   | Required | Description                                                         |
| ------------ | ------ | -------- | ------------------------------------------------------------------- |
| `sessionKey` | string | no       | Target session key                                                  |
| `label`      | string | no       | Alternative target identifier (used if `sessionKey` absent)         |
| `message`    | string | yes      | Message text                                                        |
| `timeout`    | number | no       | Wait timeout in seconds (default: 30; pass `0` for fire-and-forget) |

**Behavior**: Sends the message, then waits for the target session's reply
(fetches last 5 messages from history). With `timeout: 0`, returns immediately
with `{ runId, status: "accepted" }`.

**Returns**:

- Fire-and-forget: `{ runId, status: "accepted" }`
- With wait: `{ runId, status, reply }`
- On error: `{ runId, status: "error", error }`

Records a `message_sent` side effect.

### `sessions_spawn`

Spawn a sub-agent session to handle a delegated task.

| Parameter | Type   | Required | Description                        |
| --------- | ------ | -------- | ---------------------------------- |
| `task`    | string | yes      | Task description for the sub-agent |
| `agentId` | string | no       | Specific agent to spawn            |
| `label`   | string | no       | Label for the new session          |

Passes the current session key as the parent.

### `session_status`

Get the current status of a session.

| Parameter    | Type   | Required | Description                            |
| ------------ | ------ | -------- | -------------------------------------- |
| `sessionKey` | string | no       | Defaults to current session if omitted |

### `agents_list`

List all configured agents.

No parameters.

### `subagents`

Manage sub-agents (list, status, cancel, etc.).

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| `action`  | string | yes      | Sub-agent action to perform          |
| `params`  | object | no       | Additional parameters for the action |

The `params` object is spread into the gateway call alongside `action` and the
current `sessionKey`.

---

## Message Tools (10 tools)

**Source**: `src/middleware/mcp-handlers/message.ts`
**Permission**: All agents

All message tools inject `channel` and `accountId` from context. Tools that
send messages record a `message_sent` side effect.

### `message_send`

Send a message to a target channel or user.

| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `target`  | string | yes      | Recipient identifier |
| `message` | string | yes      | Message text         |
| `media`   | string | no       | Media URL to attach  |

### `message_reply`

Reply to a message in the current conversation.

| Parameter   | Type   | Required | Description            |
| ----------- | ------ | -------- | ---------------------- |
| `message`   | string | yes      | Reply text             |
| `replyToId` | string | no       | Message ID to reply to |

Always targets the current conversation (`ctx.to`).

### `message_thread_reply`

Reply to a message within a specific thread.

| Parameter  | Type   | Required | Description       |
| ---------- | ------ | -------- | ----------------- |
| `message`  | string | yes      | Reply text        |
| `threadId` | string | yes      | Thread identifier |

### `message_broadcast`

Broadcast a message to multiple targets.

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| `targets` | string[] | yes      | Array of recipient identifiers |
| `message` | string   | yes      | Message text                   |

### `message_react`

React to a message with an emoji.

| Parameter   | Type   | Required | Description                                         |
| ----------- | ------ | -------- | --------------------------------------------------- |
| `emoji`     | string | yes      | Emoji to react with (empty string removes reaction) |
| `messageId` | string | yes      | Target message ID                                   |

See [Reaction semantics](reactions.md) for channel-specific behavior.

### `message_delete`

Delete a message.

| Parameter   | Type   | Required | Description             |
| ----------- | ------ | -------- | ----------------------- |
| `messageId` | string | yes      | ID of message to delete |

### `message_send_attachment`

Send a file attachment to a target.

| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `target`  | string | yes      | Recipient identifier |
| `file`    | string | yes      | File URL or path     |
| `caption` | string | no       | Attachment caption   |

### `message_send_with_effect`

Send a message with a visual effect.

| Parameter  | Type   | Required | Description          |
| ---------- | ------ | -------- | -------------------- |
| `target`   | string | yes      | Recipient identifier |
| `message`  | string | yes      | Message text         |
| `effectId` | string | yes      | Effect identifier    |

### `message_pin`

Pin a message in a channel.

| Parameter   | Type   | Required | Description          |
| ----------- | ------ | -------- | -------------------- |
| `messageId` | string | yes      | ID of message to pin |

### `message_read`

Read messages from a channel.

| Parameter   | Type   | Required | Description                                             |
| ----------- | ------ | -------- | ------------------------------------------------------- |
| `channelId` | string | no       | Channel to read from (defaults to current conversation) |
| `limit`     | number | no       | Max messages to return                                  |

---

## Heartbeat Tools (1 tool)

**Source**: `src/middleware/mcp-handlers/heartbeat.ts`
**Permission**: All agents

### `heartbeat_report`

Report the result of a heartbeat check. Call this at the end of a heartbeat run
to indicate whether any actions were taken.

| Parameter       | Type    | Required | Description                                                                                                                                                  |
| --------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `anything_done` | boolean | yes      | `true` if any actions were performed or alerts need attention; `false` if nothing needs user-facing follow-up                                                |
| `summary`       | string  | no       | Optional summary of what was done or observed. When `anything_done` is true, this is delivered to the channel. When false, only shown if `showOk` is enabled |

Records a `heartbeat_report` side effect.

---

## Cron Tools (7 tools)

**Source**: `src/middleware/mcp-handlers/cron.ts`
**Permission**: Owner-only

### `cron_status`

Check cron scheduler status.

No parameters.

### `cron_list`

List cron jobs.

| Parameter | Type   | Required | Description   |
| --------- | ------ | -------- | ------------- |
| `filter`  | string | no       | Filter string |

Always includes disabled jobs in results.

### `cron_add`

Create a new cron job.

| Parameter | Type   | Required | Description                                            |
| --------- | ------ | -------- | ------------------------------------------------------ |
| `job`     | object | yes      | Full cron job definition (shape determined by gateway) |

The `job` object is passed directly as gateway params (not nested). Records a
`cron_added` side effect with the created job ID.

### `cron_update`

Update a cron job.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| `jobId`   | string | yes      | ID of the job to update |
| `patch`   | object | yes      | Partial update fields   |

### `cron_remove`

Remove a cron job.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| `jobId`   | string | yes      | ID of the job to remove |

### `cron_run`

Trigger a cron job immediately.

| Parameter | Type   | Required | Description          |
| --------- | ------ | -------- | -------------------- |
| `jobId`   | string | yes      | ID of the job to run |

Always uses force mode.

### `cron_runs`

Get run history for a cron job.

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `jobId`   | string | yes      | ID of the job             |
| `limit`   | number | no       | Max run records to return |

---

## Gateway Tools (5 tools)

**Source**: `src/middleware/mcp-handlers/gateway.ts`
**Permission**: Owner-only

### `gateway_restart`

Restart the gateway process.

No parameters. **Destructive** — restarts the running gateway.

### `gateway_config_get`

Get gateway configuration, optionally filtered by key.

| Parameter | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| `key`     | string | no       | Specific config key to retrieve |

### `gateway_config_apply`

Apply a full gateway configuration object, replacing the current configuration.

| Parameter | Type   | Required | Description                                        |
| --------- | ------ | -------- | -------------------------------------------------- |
| `config`  | object | yes      | Complete configuration object (any shape accepted) |

**Full replacement**, not a partial update.

### `gateway_config_patch`

Patch the gateway configuration with a partial update.

| Parameter | Type   | Required | Description                                        |
| --------- | ------ | -------- | -------------------------------------------------- |
| `patches` | object | yes      | Partial configuration patches (any shape accepted) |

### `gateway_config_schema`

Get the JSON schema for gateway configuration.

No parameters.

---

## Node Tools (7 tools)

**Source**: `src/middleware/mcp-handlers/nodes.ts`
**Permission**: Owner-only

### `node_list`

List connected and paired nodes.

No parameters.

### `node_describe`

Get detailed information about a specific node.

| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `nodeId`  | string | yes      | Node identifier |

### `node_invoke`

Execute a command on a connected node.

| Parameter   | Type   | Required | Description                       |
| ----------- | ------ | -------- | --------------------------------- |
| `nodeId`    | string | yes      | Target node                       |
| `command`   | string | yes      | Command name to execute           |
| `params`    | any    | no       | Command parameters                |
| `timeoutMs` | number | no       | Execution timeout in milliseconds |

Auto-generates a UUID idempotency key on every call.

### `node_rename`

Rename a paired node.

| Parameter     | Type   | Required | Description      |
| ------------- | ------ | -------- | ---------------- |
| `nodeId`      | string | yes      | Node identifier  |
| `displayName` | string | yes      | New display name |

### `node_pair_list`

List pending and completed node pairing requests.

No parameters.

### `node_pair_approve`

Approve a pending node pairing request.

| Parameter   | Type   | Required | Description        |
| ----------- | ------ | -------- | ------------------ |
| `requestId` | string | yes      | Pairing request ID |

### `node_pair_reject`

Reject a pending node pairing request.

| Parameter   | Type   | Required | Description        |
| ----------- | ------ | -------- | ------------------ |
| `requestId` | string | yes      | Pairing request ID |

---

## Canvas Tools (7 tools)

**Source**: `src/middleware/mcp-handlers/canvas.ts`
**Permission**: Owner-only

All canvas tools are thin wrappers around `node_invoke` with pre-filled
canvas-specific commands. Each call auto-generates a UUID idempotency key.

### `canvas_present`

Show the canvas on a node, optionally with a target URL and placement.

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `nodeId`  | string | yes      | Target node               |
| `url`     | string | no       | URL to load in the canvas |
| `x`       | number | no       | X position                |
| `y`       | number | no       | Y position                |
| `width`   | number | no       | Canvas width              |
| `height`  | number | no       | Canvas height             |

Placement is only sent if at least one position/dimension value is a finite
number.

### `canvas_hide`

Hide the canvas on a node.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `nodeId`  | string | yes      | Target node |

### `canvas_navigate`

Navigate the canvas to a URL.

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| `nodeId`  | string | yes      | Target node        |
| `url`     | string | yes      | URL to navigate to |

### `canvas_eval`

Evaluate JavaScript in the canvas.

| Parameter    | Type   | Required | Description                 |
| ------------ | ------ | -------- | --------------------------- |
| `nodeId`     | string | yes      | Target node                 |
| `javaScript` | string | yes      | JavaScript code to evaluate |

### `canvas_snapshot`

Capture a snapshot of the canvas.

| Parameter  | Type                           | Required | Description               |
| ---------- | ------------------------------ | -------- | ------------------------- |
| `nodeId`   | string                         | yes      | Target node               |
| `format`   | `"png"` \| `"jpg"` \| `"jpeg"` | no       | Image format              |
| `maxWidth` | number                         | no       | Max width of the snapshot |
| `quality`  | number                         | no       | Image quality             |

### `canvas_a2ui_push`

Push A2UI JSONL content to the canvas.

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `nodeId`  | string | yes      | Target node               |
| `jsonl`   | string | yes      | A2UI JSONL payload string |

### `canvas_a2ui_reset`

Reset the A2UI renderer state on a node.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `nodeId`  | string | yes      | Target node |

---

## Browser Tools (1 tool)

**Source**: `src/middleware/mcp-handlers/browser.ts`
**Permission**: Owner-only

### `browser_request`

Proxy an HTTP request through a browser-capable node.

| Parameter   | Type                              | Required | Description                     |
| ----------- | --------------------------------- | -------- | ------------------------------- |
| `method`    | `"GET"` \| `"POST"` \| `"DELETE"` | yes      | HTTP method                     |
| `path`      | string                            | yes      | Request path                    |
| `query`     | object                            | no       | Query parameters                |
| `body`      | any                               | no       | Request body                    |
| `timeoutMs` | number                            | no       | Request timeout in milliseconds |

---

## TTS Tools (6 tools)

**Source**: `src/middleware/mcp-handlers/tts.ts`
**Permission**: Owner-only

### `tts_status`

Get current TTS status (enabled, provider, fallbacks).

No parameters.

### `tts_convert`

Convert text to speech audio.

| Parameter | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| `text`    | string | yes      | Text to synthesize                             |
| `channel` | string | no       | Target channel for delivery format negotiation |

### `tts_providers`

List available TTS providers and their configuration.

No parameters.

### `tts_set_provider`

Set the active TTS provider.

| Parameter  | Type   | Required | Description                                       |
| ---------- | ------ | -------- | ------------------------------------------------- |
| `provider` | string | yes      | Provider name (`openai`, `elevenlabs`, or `edge`) |

### `tts_enable`

Enable text-to-speech.

No parameters.

### `tts_disable`

Disable text-to-speech.

No parameters.

---

## Plugin Tools (dynamic)

**Source**: `src/middleware/mcp-plugin-tools.ts`
**Permission**: All agents (availability depends on gateway plugin configuration)

Plugin tools are not statically defined. At server startup,
`registerPluginTools` calls `plugin:tools:list` on the gateway. Each returned
tool entry includes a name, description, and JSON Schema input definition,
which is converted to Zod for MCP registration.

When invoked, each plugin tool calls `plugin:tools:invoke` on the gateway with
`{ toolName, params, sessionKey }`. The response content is mapped: image
entries (with base64 `data`) become MCP image content; everything else becomes
MCP text content.

If the gateway does not have plugins enabled, `registerPluginTools` silently
skips registration.

---

## Tool Summary

| Group     | Source                      | Permission | Count   | Tools                                                                                                                                                                                                 |
| --------- | --------------------------- | ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session   | `mcp-handlers/session.ts`   | All        | 7       | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status`, `agents_list`, `subagents`                                                                                  |
| Message   | `mcp-handlers/message.ts`   | All        | 10      | `message_send`, `message_reply`, `message_thread_reply`, `message_broadcast`, `message_react`, `message_delete`, `message_send_attachment`, `message_send_with_effect`, `message_pin`, `message_read` |
| Heartbeat | `mcp-handlers/heartbeat.ts` | All        | 1       | `heartbeat_report`                                                                                                                                                                                    |
| Cron      | `mcp-handlers/cron.ts`      | Owner      | 7       | `cron_status`, `cron_list`, `cron_add`, `cron_update`, `cron_remove`, `cron_run`, `cron_runs`                                                                                                         |
| Gateway   | `mcp-handlers/gateway.ts`   | Owner      | 5       | `gateway_restart`, `gateway_config_get`, `gateway_config_apply`, `gateway_config_patch`, `gateway_config_schema`                                                                                      |
| Nodes     | `mcp-handlers/nodes.ts`     | Owner      | 7       | `node_list`, `node_describe`, `node_invoke`, `node_rename`, `node_pair_list`, `node_pair_approve`, `node_pair_reject`                                                                                 |
| Canvas    | `mcp-handlers/canvas.ts`    | Owner      | 7       | `canvas_present`, `canvas_hide`, `canvas_navigate`, `canvas_eval`, `canvas_snapshot`, `canvas_a2ui_push`, `canvas_a2ui_reset`                                                                         |
| Browser   | `mcp-handlers/browser.ts`   | Owner      | 1       | `browser_request`                                                                                                                                                                                     |
| TTS       | `mcp-handlers/tts.ts`       | Owner      | 6       | `tts_status`, `tts_convert`, `tts_providers`, `tts_set_provider`, `tts_enable`, `tts_disable`                                                                                                         |
| Plugin    | `mcp-plugin-tools.ts`       | All        | dynamic | Registered from gateway at startup                                                                                                                                                                    |
| **Total** |                             |            | **51**  |                                                                                                                                                                                                       |
