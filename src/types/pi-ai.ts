/**
 * Type definitions extracted from @mariozechner/pi-ai.
 *
 * These replace `import type` from that package so the runtime dependency can
 * be removed while keeping the type contracts intact.
 *
 * `any` in the originals is replaced with `unknown` to satisfy oxlint
 * `no-explicit-any`.
 */

import type { TSchema } from "@sinclair/typebox";

// ── Core identity types ─────────────────────────────────────────────────────

export type KnownApi =
  | "openai-completions"
  | "openai-responses"
  | "azure-openai-responses"
  | "openai-codex-responses"
  | "anthropic-messages"
  | "bedrock-converse-stream"
  | "google-generative-ai"
  | "google-gemini-cli"
  | "google-vertex";

export type Api = KnownApi | (string & {});

export type KnownProvider =
  | "amazon-bedrock"
  | "anthropic"
  | "google"
  | "google-gemini-cli"
  | "google-antigravity"
  | "google-vertex"
  | "openai"
  | "azure-openai-responses"
  | "openai-codex"
  | "github-copilot"
  | "xai"
  | "groq"
  | "cerebras"
  | "openrouter"
  | "vercel-ai-gateway"
  | "zai"
  | "mistral"
  | "minimax"
  | "minimax-cn"
  | "huggingface"
  | "opencode"
  | "kimi-coding";

// biome-ignore lint: intentional — KnownProvider provides autocomplete hints while string allows arbitrary providers
export type Provider = KnownProvider | (string & {}); // eslint-disable-line -- branded intersection preserves autocomplete

// ── Streaming & model options ───────────────────────────────────────────────

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

/** Token budgets for each thinking level (token-based providers only) */
export interface ThinkingBudgets {
  minimal?: number;
  low?: number;
  medium?: number;
  high?: number;
}

export type CacheRetention = "none" | "short" | "long";

export type Transport = "sse" | "websocket" | "auto";

export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string;
  /**
   * Preferred transport for providers that support multiple transports.
   * Providers that do not support this option ignore it.
   */
  transport?: Transport;
  /**
   * Prompt cache retention preference. Providers map this to their supported
   * values. Default: "short".
   */
  cacheRetention?: CacheRetention;
  /**
   * Optional session identifier for providers that support session-based
   * caching.
   */
  sessionId?: string;
  /** Optional callback for inspecting provider payloads before sending. */
  onPayload?: (payload: unknown) => void;
  /**
   * Optional custom HTTP headers to include in API requests.
   * Merged with provider defaults; can override default headers.
   * Not supported by all providers (e.g., AWS Bedrock uses SDK auth).
   */
  headers?: Record<string, string>;
  /**
   * Maximum delay in milliseconds to wait for a retry when the server
   * requests a long wait. Default: 60000 (60 seconds). Set to 0 to disable.
   */
  maxRetryDelayMs?: number;
  /**
   * Optional metadata to include in API requests.
   * Providers extract the fields they understand and ignore the rest.
   */
  metadata?: Record<string, unknown>;
}

export type ProviderStreamOptions = StreamOptions & Record<string, unknown>;

export interface SimpleStreamOptions extends StreamOptions {
  reasoning?: ThinkingLevel;
  /** Custom token budgets for thinking levels (token-based providers only) */
  thinkingBudgets?: ThinkingBudgets;
}

// ── Content types ───────────────────────────────────────────────────────────

export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

// ── Usage & stop reason ─────────────────────────────────────────────────────

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

// ── Messages ────────────────────────────────────────────────────────────────

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: Provider;
  model: string;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}

export interface ToolResultMessage<TDetails = unknown> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// ── Tools & context ─────────────────────────────────────────────────────────

export interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
}

export interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}

// ── Compat interfaces ───────────────────────────────────────────────────────

/**
 * OpenRouter provider routing preferences.
 * @see https://openrouter.ai/docs/provider-routing
 */
export interface OpenRouterRouting {
  /** Provider slugs to exclusively use for this request. */
  only?: string[];
  /** Provider slugs to try in order. */
  order?: string[];
}

/**
 * Vercel AI Gateway routing preferences.
 * @see https://vercel.com/docs/ai-gateway/models-and-providers/provider-options
 */
export interface VercelGatewayRouting {
  /** Provider slugs to exclusively use for this request. */
  only?: string[];
  /** Provider slugs to try in order. */
  order?: string[];
}

/**
 * Compatibility settings for OpenAI-compatible completions APIs.
 * Use this to override URL-based auto-detection for custom providers.
 */
export interface OpenAICompletionsCompat {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  requiresMistralToolIds?: boolean;
  thinkingFormat?: "openai" | "zai" | "qwen";
  openRouterRouting?: OpenRouterRouting;
  vercelGatewayRouting?: VercelGatewayRouting;
  supportsStrictMode?: boolean;
}

/** Compatibility settings for OpenAI Responses APIs. */
export interface OpenAIResponsesCompat {}

// ── Model ───────────────────────────────────────────────────────────────────

export interface Model<TApi extends Api = Api> {
  id: string;
  name: string;
  api: TApi;
  provider: Provider;
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  /** Compatibility overrides for OpenAI-compatible APIs. */
  compat?: TApi extends "openai-completions"
    ? OpenAICompletionsCompat
    : TApi extends "openai-responses"
      ? OpenAIResponsesCompat
      : never;
}

// ── Stream function ─────────────────────────────────────────────────────────

export type StreamFunction<
  TApi extends Api = Api,
  TOptions extends StreamOptions = StreamOptions,
> = (model: Model<TApi>, context: Context, options?: TOptions) => AssistantMessageEventStream;

// ── Event stream types ──────────────────────────────────────────────────────

export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | {
      type: "text_delta";
      contentIndex: number;
      delta: string;
      partial: AssistantMessage;
    }
  | {
      type: "text_end";
      contentIndex: number;
      content: string;
      partial: AssistantMessage;
    }
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | {
      type: "thinking_delta";
      contentIndex: number;
      delta: string;
      partial: AssistantMessage;
    }
  | {
      type: "thinking_end";
      contentIndex: number;
      content: string;
      partial: AssistantMessage;
    }
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | {
      type: "toolcall_delta";
      contentIndex: number;
      delta: string;
      partial: AssistantMessage;
    }
  | {
      type: "toolcall_end";
      contentIndex: number;
      toolCall: ToolCall;
      partial: AssistantMessage;
    }
  | {
      type: "done";
      reason: Extract<StopReason, "stop" | "length" | "toolUse">;
      message: AssistantMessage;
    }
  | {
      type: "error";
      reason: Extract<StopReason, "aborted" | "error">;
      error: AssistantMessage;
    };

/**
 * Generic event stream.  Declared as a class so call sites that reference
 * it as a value type (e.g. `instanceof`) keep compiling.  The actual
 * runtime implementation lives in pi-ai; only the type shape is defined here.
 */
export declare class EventStream<T, R = T> implements AsyncIterable<T> {
  constructor(isComplete: (event: T) => boolean, extractResult: (event: T) => R);
  push(event: T): void;
  end(result?: R): void;
  [Symbol.asyncIterator](): AsyncIterator<T>;
  result(): Promise<R>;
}

/**
 * Typed event stream for assistant message events.  Declared as a class
 * so code that uses `createAssistantMessageEventStream()` can reference
 * this as a return type.
 */
export declare class AssistantMessageEventStream extends EventStream<
  AssistantMessageEvent,
  AssistantMessage
> {
  constructor();
}

// ── OAuth types ─────────────────────────────────────────────────────────────

export type OAuthCredentials = {
  refresh: string;
  access: string;
  expires: number;
  [key: string]: unknown;
};

export type OAuthProviderId = string;

/** @deprecated Use OAuthProviderId instead */
export type OAuthProvider = OAuthProviderId;

export type OAuthPrompt = {
  message: string;
  placeholder?: string;
  allowEmpty?: boolean;
};

export type OAuthAuthInfo = {
  url: string;
  instructions?: string;
};

export interface OAuthLoginCallbacks {
  onAuth: (info: OAuthAuthInfo) => void;
  onPrompt: (prompt: OAuthPrompt) => Promise<string>;
  onProgress?: (message: string) => void;
  onManualCodeInput?: () => Promise<string>;
  signal?: AbortSignal;
}

export interface OAuthProviderInterface {
  readonly id: OAuthProviderId;
  readonly name: string;
  /** Run the login flow, return credentials to persist */
  login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
  /** Whether login uses a local callback server and supports manual code input. */
  usesCallbackServer?: boolean;
  /** Refresh expired credentials, return updated credentials to persist */
  refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
  /** Convert credentials to API key string for the provider */
  getApiKey(credentials: OAuthCredentials): string;
  /** Optional: modify models for this provider */
  modifyModels?(models: Model[], credentials: OAuthCredentials): Model[];
}

/** @deprecated Use OAuthProviderInterface instead */
export interface OAuthProviderInfo {
  id: OAuthProviderId;
  name: string;
  available: boolean;
}
