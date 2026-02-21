import type { ParsedLine, ResultMeta } from "./event-extract.js";
import type { AgentEvent, AgentUsage } from "./types.js";

/**
 * OpenCode NDJSON event shape.
 *
 * All events use the same top-level type `"message.part.updated"` with a
 * `part.type` discriminator — different from Claude SDK which uses top-level
 * event types.
 */
type OpenCodePart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      name: string;
      state: "running" | "complete" | "failed";
      path?: string;
      result?: string;
    };

let toolUseCounter = 0;

/** Reset the tool-use counter (for testing). */
export function resetToolUseCounter(): void {
  toolUseCounter = 0;
}

/**
 * Parse a single NDJSON line from the OpenCode CLI.
 *
 * OpenCode streams `message.part.updated` events with a `part` discriminator.
 * We map these to the common `AgentEvent` types:
 *
 * - `part.type === "text"` → `AgentTextEvent`
 * - `part.type === "tool"` + `state === "running"` → `AgentToolUseEvent`
 * - `part.type === "tool"` + `state === "complete"` → `AgentToolResultEvent`
 * - `part.type === "tool"` + `state === "failed"` → `AgentToolResultEvent` (isError=true)
 * - `part.type === "thinking"` / `"reasoning"` → ignored
 *
 * Token usage is not present in the NDJSON stream — graceful undefined.
 */
export function parseOpenCodeLine(line: string): ParsedLine[] {
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
  if (type !== "message.part.updated") {
    return [{ event: null, sessionId: undefined, usage: undefined, resultMeta: undefined }];
  }

  const part = json.part as OpenCodePart | undefined;
  if (!part) {
    return [{ event: null, sessionId: undefined, usage: undefined, resultMeta: undefined }];
  }

  return [mapPartToEvent(part)];
}

function mapPartToEvent(part: OpenCodePart): ParsedLine {
  const base = {
    sessionId: undefined,
    usage: undefined as AgentUsage | undefined,
    resultMeta: undefined as ResultMeta | undefined,
  };

  switch (part.type) {
    case "text":
      return { ...base, event: { type: "text", text: part.text } };

    case "thinking":
    case "reasoning":
      // Thinking/reasoning events are ignored per design decision
      return { ...base, event: null };

    case "tool": {
      const toolId = `opencode-tool-${String(++toolUseCounter)}`;

      if (part.state === "running") {
        const event: AgentEvent = {
          type: "tool_use",
          toolId,
          toolName: part.name,
          input: part.path ?? "",
        };
        return { ...base, event };
      }

      if (part.state === "complete") {
        const event: AgentEvent = {
          type: "tool_result",
          toolId,
          output: part.result ?? "",
          isError: false,
        };
        return { ...base, event };
      }

      if (part.state === "failed") {
        const event: AgentEvent = {
          type: "tool_result",
          toolId,
          output: part.result ?? "Tool execution failed",
          isError: true,
        };
        return { ...base, event };
      }

      return { ...base, event: null };
    }

    default:
      return { ...base, event: null };
  }
}
