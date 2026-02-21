import { describe, expect, it } from "vitest";
import { parseGeminiLine } from "./gemini-event-extract.js";

describe("parseGeminiLine", () => {
  it("returns empty array for empty/whitespace lines", () => {
    expect(parseGeminiLine("")).toEqual([]);
    expect(parseGeminiLine("   ")).toEqual([]);
    expect(parseGeminiLine("\n")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseGeminiLine("not json")).toEqual([]);
    expect(parseGeminiLine("{broken")).toEqual([]);
  });

  it("extracts sessionId from init event", () => {
    const line = JSON.stringify({ type: "init", sessionId: "abc123" });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe("abc123");
    expect(results[0].event).toBeNull();
  });

  it("parses message event as text", () => {
    const line = JSON.stringify({ type: "message", content: "Processing..." });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({ type: "text", text: "Processing..." });
  });

  it("returns null event for message with empty content", () => {
    const line = JSON.stringify({ type: "message", content: "" });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("returns null event for message without content field", () => {
    const line = JSON.stringify({ type: "message" });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("parses tool_use event", () => {
    const line = JSON.stringify({
      type: "tool_use",
      tool: "search_file_content",
      args: { query: "hello", path: "/src" },
    });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toMatchObject({
      type: "tool_use",
      toolName: "search_file_content",
      input: JSON.stringify({ query: "hello", path: "/src" }),
    });
    // toolId should be a UUID
    expect((results[0].event as { toolId: string }).toolId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("parses tool_use with string args", () => {
    const line = JSON.stringify({
      type: "tool_use",
      tool: "run_command",
      args: "ls -la",
    });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toMatchObject({
      type: "tool_use",
      toolName: "run_command",
      input: "ls -la",
    });
  });

  it("handles tool_use without tool name", () => {
    const line = JSON.stringify({ type: "tool_use", args: {} });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toMatchObject({
      type: "tool_use",
      toolName: "unknown",
    });
  });

  it("passes through tool_result without event", () => {
    const line = JSON.stringify({ type: "tool_result", result: "file contents..." });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("extracts usage from result event", () => {
    const line = JSON.stringify({
      type: "result",
      response: "Final answer",
      stats: {
        models: {
          "gemini-2.5-flash": {
            tokens: { prompt: 8965, candidates: 10, total: 9033, cached: 0, thoughts: 30 },
          },
        },
        tools: { totalCalls: 1 },
      },
    });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].usage).toEqual({
      inputTokens: 8965,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: undefined,
    });
    // result does not emit a text event (text comes from message events)
    expect(results[0].event).toBeNull();
  });

  it("extracts numTurns from tools.totalCalls in result", () => {
    const line = JSON.stringify({
      type: "result",
      response: "Done",
      stats: {
        models: {
          "gemini-2.5-flash": {
            tokens: { prompt: 100, candidates: 50, total: 150, cached: 0, thoughts: 0 },
          },
        },
        tools: { totalCalls: 3, totalSuccess: 3, totalFail: 0 },
      },
    });
    const results = parseGeminiLine(line);
    expect(results[0].resultMeta).toEqual({
      totalCostUsd: undefined,
      apiDurationMs: undefined,
      numTurns: 3,
      stopReason: undefined,
      errorSubtype: undefined,
      permissionDenials: undefined,
    });
  });

  it("handles result with no stats", () => {
    const line = JSON.stringify({ type: "result", response: "answer" });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].usage).toBeUndefined();
    expect(results[0].resultMeta).toEqual({
      totalCostUsd: undefined,
      apiDurationMs: undefined,
      numTurns: undefined,
      stopReason: undefined,
      errorSubtype: undefined,
      permissionDenials: undefined,
    });
  });

  it("handles result with empty models", () => {
    const line = JSON.stringify({
      type: "result",
      response: "answer",
      stats: { models: {}, tools: { totalCalls: 0 } },
    });
    const results = parseGeminiLine(line);
    expect(results[0].usage).toBeUndefined();
  });

  it("handles result with model but no tokens", () => {
    const line = JSON.stringify({
      type: "result",
      response: "answer",
      stats: { models: { "gemini-2.5-flash": {} }, tools: { totalCalls: 1 } },
    });
    const results = parseGeminiLine(line);
    expect(results[0].usage).toBeUndefined();
  });

  it("skips unknown event types", () => {
    const line = JSON.stringify({ type: "unknown_event", data: "whatever" });
    const results = parseGeminiLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("handles cached tokens in usage", () => {
    const line = JSON.stringify({
      type: "result",
      response: "cached response",
      stats: {
        models: {
          "gemini-2.5-flash": {
            tokens: { prompt: 500, candidates: 100, total: 650, cached: 200, thoughts: 50 },
          },
        },
        tools: { totalCalls: 0 },
      },
    });
    const results = parseGeminiLine(line);
    expect(results[0].usage).toEqual({
      inputTokens: 500,
      outputTokens: 100,
      cacheReadTokens: 200,
      cacheWriteTokens: undefined,
    });
  });
});
