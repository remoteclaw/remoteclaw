import type {
  ModelUsage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKStatusMessage,
  SDKSystemMessage,
  SDKTaskNotificationMessage,
  SDKTaskStartedMessage,
  SDKToolProgressMessage,
  SDKToolUseSummaryMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, AgentUsage, PermissionDenial } from "./types.js";

export type ResultMeta = {
  totalCostUsd: number | undefined;
  apiDurationMs: number | undefined;
  numTurns: number | undefined;
  stopReason: string | undefined;
  errorSubtype: string | undefined;
  permissionDenials: PermissionDenial[] | undefined;
};

export type ParsedLine = {
  event: AgentEvent | null;
  sessionId: string | undefined;
  usage: AgentUsage | undefined;
  resultMeta: ResultMeta | undefined;
};

export function parseLine(line: string): ParsedLine[] {
  const trimmed = line.trim();
  if (trimmed === "") {
    return [];
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }

  const type = json.type as string | undefined;

  if (type === "system") {
    return parseSystemMessage(json).map((p) => ({ ...p, resultMeta: undefined }));
  }

  if (type === "assistant") {
    const msg = json as unknown as SDKAssistantMessage;
    return parseAssistantContent(msg).map((p) => ({ ...p, resultMeta: undefined }));
  }

  if (type === "result") {
    const msg = json as unknown as SDKResultMessage;
    return [
      {
        event: null,
        sessionId: msg.session_id,
        usage: extractUsage(msg),
        resultMeta: extractResultMeta(msg),
      },
    ];
  }

  if (type === "tool_progress") {
    const msg = json as unknown as SDKToolProgressMessage;
    return [
      {
        event: {
          type: "tool_progress",
          toolId: msg.tool_use_id,
          toolName: msg.tool_name,
          elapsedSeconds: msg.elapsed_time_seconds,
        },
        sessionId: msg.session_id,
        usage: undefined,
        resultMeta: undefined,
      },
    ];
  }

  if (type === "tool_use_summary") {
    const msg = json as unknown as SDKToolUseSummaryMessage;
    return [
      {
        event: {
          type: "tool_summary",
          summary: msg.summary,
          toolIds: msg.preceding_tool_use_ids,
        },
        sessionId: msg.session_id,
        usage: undefined,
        resultMeta: undefined,
      },
    ];
  }

  return [{ event: null, sessionId: undefined, usage: undefined, resultMeta: undefined }];
}

type ParsedLineBase = Omit<ParsedLine, "resultMeta">;

function parseSystemMessage(json: Record<string, unknown>): ParsedLineBase[] {
  const subtype = json.subtype as string | undefined;
  const sessionId = json.session_id as string | undefined;

  if (subtype === "init") {
    const msg = json as unknown as SDKSystemMessage;
    return [{ event: null, sessionId: msg.session_id, usage: undefined }];
  }

  if (subtype === "status") {
    const msg = json as unknown as SDKStatusMessage;
    const status = msg.status ?? "unknown";
    return [
      {
        event: { type: "status", status },
        sessionId: msg.session_id,
        usage: undefined,
      },
    ];
  }

  if (subtype === "task_started") {
    const msg = json as unknown as SDKTaskStartedMessage;
    return [
      {
        event: {
          type: "task_started",
          taskId: msg.task_id,
          description: msg.description,
          taskType: msg.task_type,
        },
        sessionId: msg.session_id,
        usage: undefined,
      },
    ];
  }

  if (subtype === "task_notification") {
    const msg = json as unknown as SDKTaskNotificationMessage;
    return [
      {
        event: {
          type: "task_notification",
          taskId: msg.task_id,
          status: msg.status,
          summary: msg.summary,
        },
        sessionId: msg.session_id,
        usage: undefined,
      },
    ];
  }

  // Other system subtypes (hook_started, hook_progress, hook_response,
  // compact_boundary, files_persisted) — pass through without event
  return [{ event: null, sessionId, usage: undefined }];
}

function parseAssistantContent(msg: SDKAssistantMessage): ParsedLineBase[] {
  const results: ParsedLineBase[] = [];

  for (const block of msg.message.content) {
    if (block.type === "text") {
      results.push({
        event: { type: "text", text: block.text },
        sessionId: msg.session_id,
        usage: undefined,
      });
    } else if (block.type === "tool_use") {
      results.push({
        event: {
          type: "tool_use",
          toolId: block.id,
          toolName: block.name,
          input: typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? ""),
        },
        sessionId: msg.session_id,
        usage: undefined,
      });
    }
  }

  if (results.length === 0) {
    return [{ event: null, sessionId: msg.session_id, usage: undefined }];
  }

  return results;
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
      costUsd: modelUsage.costUSD,
      webSearchRequests: modelUsage.webSearchRequests,
    };
  }

  if (msg.usage) {
    return {
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheReadTokens: msg.usage.cache_read_input_tokens,
      cacheWriteTokens: msg.usage.cache_creation_input_tokens,
      costUsd: undefined,
      webSearchRequests: undefined,
    };
  }

  return undefined;
}

function extractResultMeta(msg: SDKResultMessage): ResultMeta {
  const denials = msg.permission_denials;
  return {
    totalCostUsd: msg.total_cost_usd,
    apiDurationMs: msg.duration_api_ms,
    numTurns: msg.num_turns,
    stopReason: msg.stop_reason ?? undefined,
    errorSubtype: msg.subtype === "success" ? undefined : msg.subtype,
    permissionDenials:
      denials && denials.length > 0
        ? denials.map((d) => ({ toolName: d.tool_name, toolUseId: d.tool_use_id }))
        : undefined,
  };
}
