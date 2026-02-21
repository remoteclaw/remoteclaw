import type { ParsedLine } from "./event-extract.js";

// ── Codex NDJSON shapes ──

type CodexItem = {
  id: string;
  type: string;
  command?: string;
  status?: string;
  output?: string;
  text?: string;
};

type CodexUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

// ── Parser ──

const EMPTY: ParsedLine = {
  event: null,
  sessionId: undefined,
  usage: undefined,
  resultMeta: undefined,
};

export function parseCodexLine(line: string): ParsedLine[] {
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

  if (type === "thread.started") {
    return [
      {
        event: null,
        sessionId: json.thread_id as string | undefined,
        usage: undefined,
        resultMeta: undefined,
      },
    ];
  }

  if (type === "item.started") {
    const item = json.item as CodexItem | undefined;
    if (item?.type === "command_execution") {
      return [
        {
          event: {
            type: "tool_use",
            toolId: item.id,
            toolName: "command_execution",
            input: item.command ?? "",
          },
          sessionId: undefined,
          usage: undefined,
          resultMeta: undefined,
        },
      ];
    }
    return [EMPTY];
  }

  if (type === "item.completed") {
    const item = json.item as CodexItem | undefined;
    if (!item) {
      return [EMPTY];
    }

    if (item.type === "agent_message") {
      return [
        {
          event: { type: "text", text: item.text ?? "" },
          sessionId: undefined,
          usage: undefined,
          resultMeta: undefined,
        },
      ];
    }

    if (item.type === "command_execution") {
      return [
        {
          event: {
            type: "tool_result",
            toolId: item.id,
            output: item.output ?? "",
            isError: item.status === "failed",
          },
          sessionId: undefined,
          usage: undefined,
          resultMeta: undefined,
        },
      ];
    }

    return [EMPTY];
  }

  if (type === "turn.completed") {
    const usage = json.usage as CodexUsage | undefined;
    if (usage) {
      return [
        {
          event: null,
          sessionId: undefined,
          usage: {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheReadTokens: usage.cached_input_tokens,
            cacheWriteTokens: undefined,
          },
          resultMeta: undefined,
        },
      ];
    }
    return [EMPTY];
  }

  if (type === "error") {
    const error = json.error as Record<string, unknown> | undefined;
    const message = (error?.message as string) ?? (json.message as string) ?? "Unknown Codex error";
    return [
      {
        event: { type: "error", message, category: "fatal" },
        sessionId: undefined,
        usage: undefined,
        resultMeta: undefined,
      },
    ];
  }

  // turn.started and other unrecognized event types
  return [EMPTY];
}
