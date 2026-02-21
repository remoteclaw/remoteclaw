import { randomUUID } from "node:crypto";
import type { ParsedLine, ResultMeta } from "./event-extract.js";
import type { AgentUsage } from "./types.js";

type GeminiTokenStats = {
  prompt?: number;
  candidates?: number;
  total?: number;
  cached?: number;
  thoughts?: number;
};

type GeminiStats = {
  models?: Record<string, { tokens?: GeminiTokenStats }>;
  tools?: { totalCalls?: number };
};

/**
 * Parse a single NDJSON line from the Gemini CLI (`--output-format stream-json`).
 *
 * Event types:
 *   init         → extract sessionId
 *   message      → text event (streaming content)
 *   tool_use     → tool_use event
 *   tool_result  → pass-through (no AgentEvent)
 *   result       → usage + result metadata
 */
export function parseGeminiLine(line: string): ParsedLine[] {
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

  if (type === "init") {
    return [
      {
        event: null,
        sessionId: json.sessionId as string | undefined,
        usage: undefined,
        resultMeta: undefined,
      },
    ];
  }

  if (type === "message") {
    const content = json.content as string | undefined;
    if (content) {
      return [
        {
          event: { type: "text", text: content },
          sessionId: undefined,
          usage: undefined,
          resultMeta: undefined,
        },
      ];
    }
    return [{ event: null, sessionId: undefined, usage: undefined, resultMeta: undefined }];
  }

  if (type === "tool_use") {
    const toolName = (json.tool as string | undefined) ?? "unknown";
    const args = json.args;
    return [
      {
        event: {
          type: "tool_use",
          toolId: randomUUID(),
          toolName,
          input: typeof args === "string" ? args : JSON.stringify(args ?? ""),
        },
        sessionId: undefined,
        usage: undefined,
        resultMeta: undefined,
      },
    ];
  }

  if (type === "tool_result") {
    return [{ event: null, sessionId: undefined, usage: undefined, resultMeta: undefined }];
  }

  if (type === "result") {
    const stats = json.stats as GeminiStats | undefined;
    return [
      {
        event: null,
        sessionId: undefined,
        usage: extractGeminiUsage(stats),
        resultMeta: extractGeminiResultMeta(stats),
      },
    ];
  }

  return [{ event: null, sessionId: undefined, usage: undefined, resultMeta: undefined }];
}

function extractGeminiUsage(stats: GeminiStats | undefined): AgentUsage | undefined {
  if (!stats?.models) {
    return undefined;
  }

  const modelTokens = Object.values(stats.models)[0]?.tokens;
  if (!modelTokens) {
    return undefined;
  }

  return {
    inputTokens: modelTokens.prompt,
    outputTokens: modelTokens.candidates,
    cacheReadTokens: modelTokens.cached ?? undefined,
    cacheWriteTokens: undefined,
  };
}

function extractGeminiResultMeta(stats: GeminiStats | undefined): ResultMeta {
  return {
    totalCostUsd: undefined,
    apiDurationMs: undefined,
    numTurns: stats?.tools?.totalCalls,
    stopReason: undefined,
    errorSubtype: undefined,
    permissionDenials: undefined,
  };
}
