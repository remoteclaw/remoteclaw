import type { ResolvedProviderAuth } from "../agents/model-auth.js";
import type { AgentRuntime } from "./agent-runtime.js";
import { SessionMap } from "./session-map.js";
import type {
  AgentEvent,
  AgentRunResult,
  BridgeCallbacks,
  ChannelMessage,
  ChannelReply,
} from "./types.js";

export type ChannelBridgeOptions = {
  runtime: AgentRuntime;
  sessionDir: string;
  sessionTtlMs?: number;
  defaultModel?: string;
  defaultMaxTurns?: number;
  defaultTimeoutMs?: number;
  auth?: ResolvedProviderAuth;
};

export class ChannelBridge {
  private readonly runtime: AgentRuntime;
  private readonly sessions: SessionMap;
  private readonly defaultModel: string | undefined;
  private readonly defaultMaxTurns: number | undefined;
  private readonly defaultTimeoutMs: number | undefined;
  private readonly auth: ResolvedProviderAuth | undefined;

  constructor(options: ChannelBridgeOptions) {
    this.runtime = options.runtime;
    this.sessions = new SessionMap(options.sessionDir, options.sessionTtlMs);
    this.defaultModel = options.defaultModel;
    this.defaultMaxTurns = options.defaultMaxTurns;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.auth = options.auth;
  }

  async handle(
    message: ChannelMessage,
    callbacks?: BridgeCallbacks,
    abortSignal?: AbortSignal,
  ): Promise<ChannelReply> {
    const sessionKey = {
      channelId: message.channelId,
      userId: message.userId,
      threadId: message.threadId,
    };

    const existingSessionId = this.sessions.get(sessionKey);

    const stream = this.runtime.execute({
      prompt: message.text,
      sessionId: existingSessionId,
      workspaceDir: message.workspaceDir,
      abortSignal,
      timeoutMs: this.defaultTimeoutMs,
      model: this.defaultModel,
      maxTurns: this.defaultMaxTurns,
      auth: this.auth,
    });

    let result: AgentRunResult | undefined;
    let lastError: string | undefined;

    try {
      for await (const event of stream) {
        await this.dispatchCallback(event, callbacks);

        if (event.type === "done") {
          result = event.result;
        } else if (event.type === "error") {
          lastError = event.message;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
    }

    // Update session map with returned session ID
    if (result?.sessionId) {
      this.sessions.set(sessionKey, result.sessionId);
    }

    return {
      text: result?.text ?? "",
      sessionId: result?.sessionId,
      durationMs: result?.durationMs ?? 0,
      usage: result?.usage,
      aborted: result?.aborted ?? false,
      error: lastError,
      totalCostUsd: result?.totalCostUsd,
      apiDurationMs: result?.apiDurationMs,
      numTurns: result?.numTurns,
      stopReason: result?.stopReason,
      errorSubtype: result?.errorSubtype,
      permissionDenials: result?.permissionDenials,
    };
  }

  private async dispatchCallback(event: AgentEvent, callbacks?: BridgeCallbacks): Promise<void> {
    if (!callbacks) {
      return;
    }

    switch (event.type) {
      case "text":
        await callbacks.onPartialText?.(event.text);
        break;
      case "tool_use":
        await callbacks.onToolUse?.(event.toolName, event.toolId);
        break;
      case "tool_result":
        await callbacks.onToolResult?.(event.toolId, event.output, event.isError);
        break;
      case "tool_progress":
        await callbacks.onToolProgress?.(event.toolId, event.toolName, event.elapsedSeconds);
        break;
      case "tool_summary":
        await callbacks.onToolSummary?.(event.summary);
        break;
      case "status":
        await callbacks.onStatus?.(event.status);
        break;
      case "task_started":
        await callbacks.onTaskStarted?.(event.taskId, event.description, event.taskType);
        break;
      case "task_notification":
        await callbacks.onTaskNotification?.(event.taskId, event.status, event.summary);
        break;
      case "error":
        await callbacks.onError?.(event.message, event.category);
        break;
    }
  }
}
