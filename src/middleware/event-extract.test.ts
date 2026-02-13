import { describe, expect, it } from "vitest";
import { parseLine } from "./event-extract.js";

describe("parseLine", () => {
  it("returns null for empty/whitespace lines", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("   ")).toBeNull();
    expect(parseLine("\n")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseLine("not json")).toBeNull();
    expect(parseLine("{broken")).toBeNull();
  });

  it("extracts session_id from system init event", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "abc-123",
      tools: [],
      mcp_servers: [],
      model: "claude-sonnet-4-5-20250514",
    });
    const result = parseLine(line);
    expect(result?.sessionId).toBe("abc-123");
    expect(result?.event).toBeNull();
  });

  it("parses assistant text content", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [{ type: "text", text: "hello world", citations: null }],
      },
    });
    const result = parseLine(line);
    expect(result?.event).toEqual({ type: "text", text: "hello world" });
    expect(result?.sessionId).toBe("s1");
  });

  it("joins multiple text blocks in assistant content", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "text", text: "hello ", citations: null },
          { type: "text", text: "world", citations: null },
        ],
      },
    });
    const result = parseLine(line);
    expect(result?.event).toEqual({ type: "text", text: "hello world" });
  });

  it("parses tool_use from assistant content", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo" } }],
      },
    });
    const result = parseLine(line);
    expect(result?.event).toEqual({
      type: "tool_use",
      toolId: "t1",
      toolName: "Read",
      input: JSON.stringify({ file_path: "/foo" }),
    });
  });

  it("parses tool_use with string input", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [{ type: "tool_use", id: "t2", name: "Bash", input: "ls -la" }],
      },
    });
    const result = parseLine(line);
    expect(result?.event).toEqual({
      type: "tool_use",
      toolId: "t2",
      toolName: "Bash",
      input: "ls -la",
    });
  });

  it("extracts usage from result event via top-level usage (snake_case)", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "s1",
      result: "done",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
      modelUsage: {},
    });
    const result = parseLine(line);
    expect(result?.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });
    expect(result?.event).toBeNull();
  });

  it("prefers modelUsage over top-level usage", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "s1",
      result: "done",
      usage: { input_tokens: 1, output_tokens: 1 },
      modelUsage: {
        "claude-sonnet-4-5-20250514": {
          inputTokens: 300,
          outputTokens: 150,
          cacheReadInputTokens: 30,
          cacheCreationInputTokens: 15,
          webSearchRequests: 0,
          costUSD: 0.01,
          contextWindow: 200000,
          maxOutputTokens: 8192,
        },
      },
    });
    const result = parseLine(line);
    expect(result?.usage).toEqual({
      inputTokens: 300,
      outputTokens: 150,
      cacheReadTokens: 30,
      cacheWriteTokens: 15,
    });
  });

  it("extracts sessionId from result event", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "s2",
      result: "done",
      usage: { input_tokens: 10, output_tokens: 5 },
      modelUsage: {},
    });
    const result = parseLine(line);
    expect(result?.sessionId).toBe("s2");
    expect(result?.event).toBeNull();
  });

  it("returns null event for assistant without content", () => {
    const line = JSON.stringify({ type: "assistant", session_id: "s1", message: { content: [] } });
    const result = parseLine(line);
    expect(result?.event).toBeNull();
  });

  it("skips unknown event types", () => {
    const line = JSON.stringify({ type: "unknown_event", data: "whatever" });
    const result = parseLine(line);
    expect(result?.event).toBeNull();
  });

  it("skips thinking blocks in assistant content", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "thinking", thinking: "Let me think about this..." },
          { type: "text", text: "Here is my answer", citations: null },
        ],
      },
    });
    const result = parseLine(line);
    expect(result?.event).toEqual({ type: "text", text: "Here is my answer" });
  });
});
