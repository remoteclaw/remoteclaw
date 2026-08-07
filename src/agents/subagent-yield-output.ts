/**
 * sessions_yield transcript detectors.
 *
 * Accepts provider-specific tool-call and tool-result shapes used by transcript repair and announce capture.
 */
import { safeParseJson } from "@remoteclaw/normalization-core";
import { asOptionalRecord } from "@remoteclaw/normalization-core/record-coerce";
import { readTrimmedStringAlias } from "../utils/string-readers.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  assistantCallsSessionsYield: "live",
  isSessionsYieldToolResult: "live",
} as const;

function readToolName(value: unknown): string | undefined {
  const record = asOptionalRecord(value);
  if (!record) {
    return undefined;
  }
  return readTrimmedStringAlias(record, [
    "name",
    "toolName",
    "tool_name",
    "functionName",
    "function_name",
  ]);
}

function isToolCallBlock(value: unknown): boolean {
  const record = asOptionalRecord(value);
  if (!record) {
    return false;
  }
  return (
    record.type === "toolCall" ||
    record.type === "tool_use" ||
    record.type === "toolUse" ||
    record.type === "functionCall" ||
    record.type === "function_call"
  );
}

/** Returns true when an assistant message requested the sessions_yield tool. */
export function assistantCallsSessionsYield(message: unknown): boolean {
  const record = asOptionalRecord(message);
  if (!record || record.role !== "assistant" || !Array.isArray(record.content)) {
    return false;
  }
  return record.content.some(
    (block) => isToolCallBlock(block) && readToolName(block) === "sessions_yield",
  );
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }
  return asOptionalRecord(safeParseJson(trimmed));
}

function readStructuredToolPayload(content: unknown): Record<string, unknown> | undefined {
  const record = asOptionalRecord(content);
  if (record) {
    return record;
  }
  if (typeof content === "string") {
    return parseJsonObject(content);
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const block of content) {
    const blockRecord = asOptionalRecord(block);
    if (!blockRecord) {
      continue;
    }
    const text = blockRecord.text;
    if (typeof text !== "string") {
      continue;
    }
    const parsed = parseJsonObject(text);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

/** Returns true when a tool result represents a completed sessions_yield handoff. */
export function isSessionsYieldToolResult(
  message: unknown,
  previousAssistantCalledYield: boolean,
): boolean {
  const record = asOptionalRecord(message);
  if (!record || (record.role !== "toolResult" && record.role !== "tool")) {
    return false;
  }
  const toolName = readToolName(record);
  if (toolName === "sessions_yield") {
    return true;
  }
  if (!previousAssistantCalledYield) {
    return false;
  }
  // Some providers omit the tool name on results; use adjacency plus yielded status as fallback.
  const details = asOptionalRecord(record.details);
  if (details?.status === "yielded") {
    return true;
  }
  const payload = readStructuredToolPayload(record.content);
  return payload?.status === "yielded";
}
