// Local structural type stubs replacing @mariozechner/pi-agent-core and @mariozechner/pi-ai types.
// These match the shapes actually consumed by live code after the Pi execution engine removal.

export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  };
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError: boolean;
  timestamp: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

export interface AgentToolResult<T = unknown> {
  content: (TextContent | ImageContent)[];
  details: T;
}

// oxlint-disable-next-line typescript/no-explicit-any
export interface AgentTool<TParameters = any, TDetails = unknown> {
  name: string;
  description: string;
  parameters: TParameters;
  label?: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: (details: TDetails) => void,
  ) => Promise<AgentToolResult<TDetails>>;
}

export type OAuthCredentials = {
  refresh: string;
  access: string;
  expires: number;
  [key: string]: unknown;
};
