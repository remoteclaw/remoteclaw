import type { ReplyPayload } from "../auto-reply/types.js";

// ── Agent Runtime ───────────────────────────────────────────────────────

/** Core interface that all CLI runtime implementations (Claude, Gemini, Codex, OpenCode) implement. */
export interface AgentRuntime {
  execute(params: AgentExecuteParams): AsyncIterable<AgentEvent>;

  /** Declare which media types this runtime can handle natively. */
  readonly mediaCapabilities?: {
    /** MIME type prefixes accepted as inbound media (e.g., ["image/", "audio/", "video/"]). */
    acceptsInbound?: readonly string[];
    /** Whether the runtime can emit media in responses. */
    emitsOutbound?: boolean;
  };
}

// ── Media Attachments ─────────────────────────────────────────────────

/** A media attachment included with a prompt or produced by an agent. */
export type MediaAttachment = {
  /** MIME type (e.g., "image/jpeg", "audio/ogg", "video/mp4"). */
  mimeType: string;
  /** Local file path to the media (preferred for CLI runtimes that accept file paths). */
  filePath?: string | undefined;
  /** Base64-encoded content (for runtimes that accept inline data). */
  base64?: string | undefined;
  /** Original URL (for reference/logging; runtimes should prefer filePath or base64). */
  sourceUrl?: string | undefined;
  /** Original filename (for display/logging). */
  fileName?: string | undefined;
};

// ── Agent Execute Params ──────────────────────────────────────────────

/** Input to {@link AgentRuntime.execute}. */
export type AgentExecuteParams = {
  /** The user prompt to send to the agent. */
  prompt: string;
  /** System instructions for the agent (passed separately where supported). */
  systemPrompt?: string | undefined;
  /** Extra context inserted between the system prompt and user prompt. */
  extraContext?: string | undefined;
  /** Thread history or thread-starter context (skipped on session resume). */
  threadContext?: string | undefined;
  /** Media attachments to include with the prompt. */
  media?: MediaAttachment[] | undefined;
  /** Resume an existing session (CLI-specific session identifier). */
  sessionId?: string | undefined;
  /** MCP server configurations to expose to the agent. */
  mcpServers?: Record<string, McpServerConfig> | undefined;
  /** Abort signal for cancelling the execution. */
  abortSignal?: AbortSignal | undefined;
  /** Working directory for the CLI subprocess. */
  workingDirectory?: string | undefined;
  /** Additional environment variables for the CLI subprocess. */
  env?: Record<string, string> | undefined;
  /** Extra CLI arguments appended after the runtime's own args. */
  extraArgs?: string[] | undefined;
};

/** MCP server configuration passed to agent CLI subprocesses. */
export type McpServerConfig = {
  command: string;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
};

// ── Agent Events ────────────────────────────────────────────────────────

/** Discriminated union of events emitted during CLI subprocess execution. */
export type AgentEvent =
  | AgentTextEvent
  | AgentMediaEvent
  | AgentThinkingEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentErrorEvent
  | AgentDoneEvent;

export type AgentTextEvent = {
  type: "text";
  text: string;
};

export type AgentMediaEvent = {
  type: "media";
  media: MediaAttachment;
};

export type AgentThinkingEvent = {
  type: "thinking";
  text: string;
};

export type AgentToolUseEvent = {
  type: "tool_use";
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
};

export type AgentToolResultEvent = {
  type: "tool_result";
  toolId: string;
  output: string;
  isError?: boolean | undefined;
};

export type AgentErrorEvent = {
  type: "error";
  message: string;
  code?: string | undefined;
};

export type AgentDoneEvent = {
  type: "done";
  result: AgentRunResult;
};

// ── Agent Run Result ────────────────────────────────────────────────────

/** Final CLI output summary produced when execution completes. */
export type AgentRunResult = {
  /** Accumulated text output from the agent. */
  text: string;
  /** Media attachments produced by the agent (non-MCP path). */
  media?: MediaAttachment[] | undefined;
  /** CLI-specific session identifier for resumption. */
  sessionId: string | undefined;
  /** Wall-clock duration of the entire run in milliseconds. */
  durationMs: number;
  /** Token usage breakdown (if reported by the CLI). */
  usage: AgentUsage | undefined;
  /** Whether the run was aborted via the abort signal. */
  aborted: boolean;
  /** Captured stderr output from the CLI subprocess (if any). */
  stderr?: string | undefined;
  /** Estimated total cost in USD (if reported by the CLI). */
  totalCostUsd?: number | undefined;
  /** Duration spent in API calls in milliseconds (if reported). */
  apiDurationMs?: number | undefined;
  /** Number of agentic turns taken (if reported). */
  numTurns?: number | undefined;
  /** Why the agent stopped (e.g., "end_turn", "max_tokens"). */
  stopReason?: string | undefined;
  /** Error subtype for classification (e.g., "rate_limit", "context_window"). */
  errorSubtype?: string | undefined;
  /** Permission denials encountered during the run. */
  permissionDenials?: PermissionDenial[] | undefined;
};

/** Token usage breakdown. */
export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
};

/** A permission denial encountered during an agent run. */
export type PermissionDenial = {
  tool: string;
  reason?: string | undefined;
};

// ── MCP Side Effects ────────────────────────────────────────────────────

/** Target of a message sent via an MCP tool during the agent run. */
export type McpMessageTarget = {
  /** MCP tool name (e.g., "message", "sessions_send", "telegram_send"). */
  tool: string;
  /** Channel provider (e.g., "telegram", "discord", "slack"). */
  provider: string;
  /** Account identifier within the provider. */
  accountId?: string | undefined;
  /** Target identifier (chat ID, channel ID, etc.). */
  to?: string | undefined;
};

/** Structured heartbeat report from the heartbeat_report MCP tool. */
export type McpHeartbeatReport = {
  /** Whether any actions were performed during the heartbeat run. */
  anythingDone: boolean;
  /** Optional summary text. */
  summary?: string | null;
};

/** Gateway-side MCP server tracking of side effects during agent execution. */
export type McpSideEffects = {
  /** Texts sent via MCP messaging tools. */
  sentTexts: string[];
  /** Media URLs sent via MCP messaging tools. */
  sentMediaUrls: string[];
  /** Targets of messages sent via MCP messaging tools. */
  sentTargets: McpMessageTarget[];
  /** Number of cron jobs added via MCP tools. */
  cronAdds: number;
  /** Heartbeat report from the heartbeat_report tool (if called). */
  heartbeatReport?: McpHeartbeatReport | undefined;
};

// ── Agent Delivery Result ───────────────────────────────────────────────

/**
 * The three-type delivery contract:
 * `AgentRunResult` (CLI output) + `McpSideEffects` (gateway tracking) = `AgentDeliveryResult`.
 *
 * This is what the delivery pipeline consumers receive.
 */
export type AgentDeliveryResult = {
  /** Reply payloads for delivery to the channel. */
  payloads: ReplyPayload[];
  /** CLI subprocess output summary. */
  run: AgentRunResult;
  /** Gateway-side MCP server side effects. */
  mcp: McpSideEffects;
  /** Top-level error message, if the run failed. */
  error?: string | undefined;
};

// ── Channel Message ─────────────────────────────────────────────────────

/** Incoming message from a channel, normalized across providers. */
export type ChannelMessage = {
  /** Provider-assigned message identifier. */
  id: string;
  /** Message text body. */
  text: string;
  /** Sender identifier (provider-specific). */
  from: string;
  /** Channel or chat identifier. */
  channelId: string;
  /** Channel provider name (e.g., "telegram", "discord", "whatsapp"). */
  provider: string;
  /** Message timestamp (epoch milliseconds). */
  timestamp: number;
  /** ID of the message being replied to, if any. */
  replyToId?: string | undefined;
  /** Media URLs attached to the message. */
  mediaUrls?: string[] | undefined;
  /** Channel-specific formatting hints (e.g., LINE directives, Discord component schema). */
  messageToolHints?: string[] | undefined;
  /** Extra context to prepend between the system prompt and user text (e.g. per-channel instructions). */
  extraContext?: string | undefined;
  /** Thread history or thread-starter context (skipped on session resume). */
  threadContext?: string | undefined;
  /** Provider-specific metadata. */
  metadata?: Record<string, unknown> | undefined;
  /** Whether the message sender is the bot owner. Defaults to `false`. */
  senderIsOwner?: boolean | undefined;
  /** Tool profile controlling which tool categories are available. Defaults to `"full"`. */
  toolProfile?: string | undefined;
  /** Display name of the user sending the message. */
  userName?: string | undefined;
  /** Agent identifier within RemoteClaw. */
  agentId?: string | undefined;
  /** IANA timezone string (e.g., "America/New_York"). */
  timezone?: string | undefined;
  /** Phone numbers / IDs of authorized senders (owner allowlist). */
  authorizedSenders?: string[] | undefined;
  /** Reaction/emoji guidance level for the system prompt. */
  reactionGuidance?: { level: "minimal" | "extensive"; channel: string } | undefined;
};

// ── Bridge Callbacks ────────────────────────────────────────────────────

/** Streaming callbacks used by ChannelBridge during agent execution. */
export type BridgeCallbacks = {
  /** Called when a partial (streaming) text chunk is available. */
  onPartialReply?: ((payload: ReplyPayload) => Promise<void> | void) | undefined;
  /** Called when a complete reply block is available. */
  onBlockReply?: ((payload: ReplyPayload) => Promise<void> | void) | undefined;
  /** Called when a tool result is available. */
  onToolResult?: ((payload: ReplyPayload) => Promise<void> | void) | undefined;
  /** Called when the agent emits thinking content. */
  onThinking?: ((payload: { text: string }) => void) | undefined;
};
