import type { ResolvedProviderAuth } from "../agents/model-auth.js";

// ── Error Classification ──

export type ErrorCategory = "retryable" | "fatal" | "context_overflow" | "aborted" | "timeout";

// ── Agent Events ──

export type AgentTextEvent = { type: "text"; text: string };

export type AgentToolUseEvent = {
  type: "tool_use";
  toolId: string;
  toolName: string;
  input: string;
};

export type AgentToolResultEvent = {
  type: "tool_result";
  toolId: string;
  output: string;
  isError: boolean;
};

export type AgentErrorEvent = { type: "error"; message: string; category: ErrorCategory };

export type AgentDoneEvent = { type: "done"; result: AgentRunResult };

export type AgentEvent =
  | AgentTextEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentErrorEvent
  | AgentDoneEvent;

// ── Usage ──

export type AgentUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  cacheReadTokens: number | undefined;
  cacheWriteTokens: number | undefined;
};

// ── Runtime Parameters ──

export type AgentRuntimeParams = {
  prompt: string;
  sessionId: string | undefined;
  workspaceDir: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  model?: string;
  maxTurns?: number;
  auth?: ResolvedProviderAuth;
};

// ── Run Result ──

export type AgentRunResult = {
  text: string;
  sessionId: string | undefined;
  durationMs: number;
  usage: AgentUsage | undefined;
  aborted: boolean;
};

// ── Channel Bridge Types ──

export type SessionMapKey = { channelId: string; userId: string; threadId: string | undefined };

export type ChannelMessage = {
  channelId: string;
  userId: string;
  threadId: string | undefined;
  text: string;
  workspaceDir: string;
};

export type ChannelReply = {
  text: string;
  sessionId: string | undefined;
  durationMs: number;
  usage: AgentUsage | undefined;
  aborted: boolean;
  error: string | undefined;
};

export type BridgeCallbacks = {
  onPartialText?: (text: string) => void | Promise<void>;
  onToolUse?: (toolName: string, toolId: string) => void | Promise<void>;
  onError?: (message: string, category: ErrorCategory) => void | Promise<void>;
};
