import type {
  ModelUsage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, AgentUsage } from "./types.js";

export type ParsedLine = {
  event: AgentEvent | null;
  sessionId: string | undefined;
  usage: AgentUsage | undefined;
};

export function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (trimmed === "") {
    return null;
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  const type = json.type as string | undefined;

  if (type === "system") {
    const msg = json as unknown as SDKSystemMessage;
    return { event: null, sessionId: msg.session_id, usage: undefined };
  }

  if (type === "assistant") {
    const msg = json as unknown as SDKAssistantMessage;
    return parseAssistantContent(msg);
  }

  if (type === "result") {
    const msg = json as unknown as SDKResultMessage;
    return { event: null, sessionId: msg.session_id, usage: extractUsage(msg) };
  }

  return { event: null, sessionId: undefined, usage: undefined };
}

function parseAssistantContent(msg: SDKAssistantMessage): ParsedLine {
  const textParts: string[] = [];

  for (const block of msg.message.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      return {
        event: {
          type: "tool_use",
          toolId: block.id,
          toolName: block.name,
          input: typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? ""),
        },
        sessionId: msg.session_id,
        usage: undefined,
      };
    }
  }

  if (textParts.length > 0) {
    return {
      event: { type: "text", text: textParts.join("") },
      sessionId: msg.session_id,
      usage: undefined,
    };
  }

  return { event: null, sessionId: msg.session_id, usage: undefined };
}

function extractUsage(msg: SDKResultMessage): AgentUsage | undefined {
  // Prefer per-model usage (camelCase, richer), fall back to top-level usage (snake_case)
  const modelUsage = msg.modelUsage
    ? (Object.values(msg.modelUsage)[0] as ModelUsage | undefined)
    : undefined;
  if (modelUsage) {
    return {
      inputTokens: modelUsage.inputTokens,
      outputTokens: modelUsage.outputTokens,
      cacheReadTokens: modelUsage.cacheReadInputTokens,
      cacheWriteTokens: modelUsage.cacheCreationInputTokens,
    };
  }

  if (msg.usage) {
    return {
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheReadTokens: msg.usage.cache_read_input_tokens,
      cacheWriteTokens: msg.usage.cache_creation_input_tokens,
    };
  }

  return undefined;
}
