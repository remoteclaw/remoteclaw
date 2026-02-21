import { describe, expect, it } from "vitest";
import { parseCodexLine } from "./codex-event-extract.js";

describe("parseCodexLine", () => {
  it("returns empty array for empty/whitespace lines", () => {
    expect(parseCodexLine("")).toEqual([]);
    expect(parseCodexLine("   ")).toEqual([]);
    expect(parseCodexLine("\n")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseCodexLine("not json")).toEqual([]);
    expect(parseCodexLine("{broken")).toEqual([]);
  });

  // ── thread.started ──

  it("extracts session ID from thread.started event", () => {
    const line = JSON.stringify({
      type: "thread.started",
      thread_id: "0199a213-81c0-7800-8aa1-bbab2a035a53",
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe("0199a213-81c0-7800-8aa1-bbab2a035a53");
    expect(results[0].event).toBeNull();
  });

  // ── item.started (command_execution) ──

  it("parses item.started command_execution as tool_use", () => {
    const line = JSON.stringify({
      type: "item.started",
      item: {
        id: "item_1",
        type: "command_execution",
        command: "bash -lc ls",
        status: "in_progress",
      },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_use",
      toolId: "item_1",
      toolName: "command_execution",
      input: "bash -lc ls",
    });
  });

  it("handles item.started with missing command gracefully", () => {
    const line = JSON.stringify({
      type: "item.started",
      item: { id: "item_1", type: "command_execution" },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_use",
      toolId: "item_1",
      toolName: "command_execution",
      input: "",
    });
  });

  it("returns null event for item.started with non-command type", () => {
    const line = JSON.stringify({
      type: "item.started",
      item: { id: "item_1", type: "unknown_type" },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  // ── item.completed (agent_message) ──

  it("parses item.completed agent_message as text event", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_3",
        type: "agent_message",
        text: "Repo contains docs, sdk, examples.",
      },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "text",
      text: "Repo contains docs, sdk, examples.",
    });
  });

  it("handles agent_message with missing text as empty string", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "item_3", type: "agent_message" },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({ type: "text", text: "" });
  });

  // ── item.completed (command_execution) ──

  it("parses item.completed command_execution as tool_result", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "command_execution",
        command: "bash -lc ls",
        status: "completed",
        output: "file1\nfile2\nfile3",
      },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_result",
      toolId: "item_1",
      output: "file1\nfile2\nfile3",
      isError: false,
    });
  });

  it("marks failed command_execution as error", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_2",
        type: "command_execution",
        command: "bash -lc bad-command",
        status: "failed",
        output: "command not found",
      },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_result",
      toolId: "item_2",
      output: "command not found",
      isError: true,
    });
  });

  it("handles command_execution with missing output", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "command_execution",
        status: "completed",
      },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_result",
      toolId: "item_1",
      output: "",
      isError: false,
    });
  });

  // ── item.completed (unknown type) ──

  it("returns null event for item.completed with unknown item type", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "item_5", type: "something_else" },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("returns null event for item.completed with no item", () => {
    const line = JSON.stringify({ type: "item.completed" });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  // ── turn.completed ──

  it("extracts usage from turn.completed", () => {
    const line = JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 24763,
        cached_input_tokens: 24448,
        output_tokens: 122,
      },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
    expect(results[0].usage).toEqual({
      inputTokens: 24763,
      outputTokens: 122,
      cacheReadTokens: 24448,
      cacheWriteTokens: undefined,
    });
  });

  it("handles turn.completed without usage", () => {
    const line = JSON.stringify({ type: "turn.completed" });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
    expect(results[0].usage).toBeUndefined();
  });

  // ── error ──

  it("parses error event with nested error object", () => {
    const line = JSON.stringify({
      type: "error",
      error: { message: "Rate limit exceeded", code: "rate_limit" },
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "error",
      message: "Rate limit exceeded",
      category: "fatal",
    });
  });

  it("parses error event with top-level message", () => {
    const line = JSON.stringify({
      type: "error",
      message: "Connection failed",
    });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "error",
      message: "Connection failed",
      category: "fatal",
    });
  });

  it("uses default message when error has no message", () => {
    const line = JSON.stringify({ type: "error" });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "error",
      message: "Unknown Codex error",
      category: "fatal",
    });
  });

  // ── passthrough / ignored ──

  it("returns null event for turn.started", () => {
    const line = JSON.stringify({ type: "turn.started" });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("returns null event for unknown event types", () => {
    const line = JSON.stringify({ type: "something.unknown", data: "whatever" });
    const results = parseCodexLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  // ── metadata fields ──

  it("does not set resultMeta for any Codex event", () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "t1" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "i1", type: "agent_message", text: "hi" },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ];
    for (const line of lines) {
      const results = parseCodexLine(line);
      expect(results[0].resultMeta).toBeUndefined();
    }
  });

  it("does not set sessionId for non-thread events", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "i1", type: "agent_message", text: "hi" },
    });
    const results = parseCodexLine(line);
    expect(results[0].sessionId).toBeUndefined();
  });
});
