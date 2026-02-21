/**
 * Type definitions extracted from @mariozechner/pi-agent-core.
 *
 * These replace `import type` from that package so the runtime dependency can
 * be removed while keeping the type contracts intact.
 *
 * `any` in the originals is replaced with `unknown` to satisfy oxlint
 * `no-explicit-any`.
 */

import type { Static, TSchema } from "@sinclair/typebox";
import type {
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  ImageContent,
  Message,
  Model,
  SimpleStreamOptions,
  TextContent,
  ToolResultMessage,
  Tool,
} from "./pi-ai.js";

// ── Stream function ─────────────────────────────────────────────────────────

/** Stream function - can return sync or Promise for async config lookup */
export type StreamFn = (
  model: Model,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;

// ── Agent loop config ───────────────────────────────────────────────────────

/**
 * Thinking/reasoning level for models that support it.
 * Note: "xhigh" is only supported by OpenAI gpt-5.1-codex-max, gpt-5.2,
 * gpt-5.2-codex, gpt-5.3, and gpt-5.3-codex models.
 *
 * This extends the pi-ai ThinkingLevel with "off".
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Extensible interface for custom app messages.
 * Apps can extend via declaration merging:
 *
 * @example
 * ```typescript
 * declare module "@mariozechner/agent" {
 *   interface CustomAgentMessages {
 *     artifact: ArtifactMessage;
 *     notification: NotificationMessage;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: extensible by declaration merging
export interface CustomAgentMessages {}

/**
 * AgentMessage: Union of LLM messages + custom messages.
 * This abstraction allows apps to add custom message types while maintaining
 * type safety and compatibility with the base LLM messages.
 */
// oxlint(no-redundant-type-constituents): intentional — CustomAgentMessages is a module augmentation point
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]; // eslint-disable-line

// ── Tool types ──────────────────────────────────────────────────────────────

export interface AgentToolResult<T = unknown> {
  content: (TextContent | ImageContent)[];
  details: T;
}

export type AgentToolUpdateCallback<T = unknown> = (partialResult: AgentToolResult<T>) => void;

export interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
> extends Tool<TParameters> {
  label: string;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
}

// ── Agent context & state ───────────────────────────────────────────────────

export interface AgentContext {
  systemPrompt: string;
  messages: AgentMessage[];
  tools?: AgentTool[];
}

/**
 * Configuration for the agent loop.
 */
export interface AgentLoopConfig extends SimpleStreamOptions {
  model: Model;
  /**
   * Converts AgentMessage[] to LLM-compatible Message[] before each LLM call.
   *
   * Each AgentMessage must be converted to a UserMessage, AssistantMessage,
   * or ToolResultMessage that the LLM can understand. AgentMessages that
   * cannot be converted (e.g., UI-only notifications, status messages) should
   * be filtered out.
   */
  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  /**
   * Optional transform applied to the context before `convertToLlm`.
   *
   * Use this for operations that work at the AgentMessage level:
   * - Context window management (pruning old messages)
   * - Injecting context from external sources
   */
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  /**
   * Resolves an API key dynamically for each LLM call.
   *
   * Useful for short-lived OAuth tokens (e.g., GitHub Copilot) that may
   * expire during long-running tool execution phases.
   */
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  /**
   * Returns steering messages to inject into the conversation mid-run.
   *
   * Called after each tool execution to check for user interruptions.
   * If messages are returned, remaining tool calls are skipped and
   * these messages are added to the context before the next LLM call.
   *
   * Use this for "steering" the agent while it's working.
   */
  getSteeringMessages?: () => Promise<AgentMessage[]>;
  /**
   * Returns follow-up messages to process after the agent would otherwise
   * stop.
   *
   * Called when the agent has no more tool calls and no steering messages.
   * If messages are returned, they're added to the context and the agent
   * continues with another turn.
   *
   * Use this for follow-up messages that should wait until the agent
   * finishes.
   */
  getFollowUpMessages?: () => Promise<AgentMessage[]>;
}

/**
 * Agent state containing all configuration and conversation data.
 */
export interface AgentState {
  systemPrompt: string;
  model: Model;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool[];
  messages: AgentMessage[];
  isStreaming: boolean;
  streamMessage: AgentMessage | null;
  pendingToolCalls: Set<string>;
  error?: string;
}

// ── Agent events ────────────────────────────────────────────────────────────

/**
 * Events emitted by the Agent for UI updates.
 * These events provide fine-grained lifecycle information for messages,
 * turns, and tool executions.
 */
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: AgentMessage;
      toolResults: ToolResultMessage[];
    }
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AgentMessage;
      assistantMessageEvent: AssistantMessageEvent;
    }
  | { type: "message_end"; message: AgentMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: unknown;
      partialResult: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    };
