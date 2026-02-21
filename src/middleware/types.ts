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

export type AgentToolProgressEvent = {
  type: "tool_progress";
  toolId: string;
  toolName: string;
  elapsedSeconds: number;
};

export type AgentToolSummaryEvent = {
  type: "tool_summary";
  summary: string;
  toolIds: string[];
};

export type AgentStatusEvent = {
  type: "status";
  status: string;
};

export type AgentTaskStartedEvent = {
  type: "task_started";
  taskId: string;
  description: string;
  taskType: string | undefined;
};

export type AgentTaskNotificationEvent = {
  type: "task_notification";
  taskId: string;
  status: "completed" | "failed" | "stopped";
  summary: string;
};

export type AgentErrorEvent = { type: "error"; message: string; category: ErrorCategory };

export type AgentDoneEvent = { type: "done"; result: AgentRunResult };

export type AgentEvent =
  | AgentTextEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentToolProgressEvent
  | AgentToolSummaryEvent
  | AgentStatusEvent
  | AgentTaskStartedEvent
  | AgentTaskNotificationEvent
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
  onToolResult?: (toolId: string, output: string, isError: boolean) => void | Promise<void>;
  onToolProgress?: (
    toolId: string,
    toolName: string,
    elapsedSeconds: number,
  ) => void | Promise<void>;
  onToolSummary?: (summary: string) => void | Promise<void>;
  onStatus?: (status: string) => void | Promise<void>;
  onTaskStarted?: (
    taskId: string,
    description: string,
    taskType: string | undefined,
  ) => void | Promise<void>;
  onTaskNotification?: (
    taskId: string,
    status: "completed" | "failed" | "stopped",
    summary: string,
  ) => void | Promise<void>;
  onError?: (message: string, category: ErrorCategory) => void | Promise<void>;
};
