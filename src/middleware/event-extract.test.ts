import { describe, expect, it } from "vitest";
import { parseLine } from "./event-extract.js";

describe("parseLine", () => {
  it("returns empty array for empty/whitespace lines", () => {
    expect(parseLine("")).toEqual([]);
    expect(parseLine("   ")).toEqual([]);
    expect(parseLine("\n")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseLine("not json")).toEqual([]);
    expect(parseLine("{broken")).toEqual([]);
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
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe("abc-123");
    expect(results[0].event).toBeNull();
  });

  it("parses assistant text content", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [{ type: "text", text: "hello world", citations: null }],
      },
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({ type: "text", text: "hello world" });
    expect(results[0].sessionId).toBe("s1");
  });

  it("returns separate events for multiple text blocks in assistant content", () => {
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
    const results = parseLine(line);
    expect(results).toHaveLength(2);
    expect(results[0].event).toEqual({ type: "text", text: "hello " });
    expect(results[1].event).toEqual({ type: "text", text: "world" });
  });

  it("parses tool_use from assistant content", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo" } }],
      },
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
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
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_use",
      toolId: "t2",
      toolName: "Bash",
      input: "ls -la",
    });
  });

  it("parses all content blocks from assistant message (text + tool_use + text)", () => {
    const line = JSON.stringify({
      type: "assistant",
      session_id: "s1",
      message: {
        content: [
          { type: "text", text: "Let me check", citations: null },
          { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo" } },
          { type: "text", text: "Done reading", citations: null },
        ],
      },
    });
    const results = parseLine(line);
    expect(results).toHaveLength(3);
    expect(results[0].event).toEqual({ type: "text", text: "Let me check" });
    expect(results[1].event).toEqual({
      type: "tool_use",
      toolId: "t1",
      toolName: "Read",
      input: JSON.stringify({ file_path: "/foo" }),
    });
    expect(results[2].event).toEqual({ type: "text", text: "Done reading" });
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
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });
    expect(results[0].event).toBeNull();
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
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].usage).toEqual({
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
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe("s2");
    expect(results[0].event).toBeNull();
  });

  it("returns null event for assistant without content", () => {
    const line = JSON.stringify({ type: "assistant", session_id: "s1", message: { content: [] } });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("skips unknown event types", () => {
    const line = JSON.stringify({ type: "unknown_event", data: "whatever" });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
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
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({ type: "text", text: "Here is my answer" });
  });

  // ── New SDK message type tests ──

  it("parses tool_progress event", () => {
    const line = JSON.stringify({
      type: "tool_progress",
      tool_use_id: "t1",
      tool_name: "Bash",
      parent_tool_use_id: null,
      elapsed_time_seconds: 5.2,
      uuid: "00000000-0000-0000-0000-000000000001",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_progress",
      toolId: "t1",
      toolName: "Bash",
      elapsedSeconds: 5.2,
    });
    expect(results[0].sessionId).toBe("s1");
  });

  it("parses tool_use_summary event", () => {
    const line = JSON.stringify({
      type: "tool_use_summary",
      summary: "Read 3 files, wrote 1 file",
      preceding_tool_use_ids: ["t1", "t2", "t3"],
      uuid: "00000000-0000-0000-0000-000000000002",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_summary",
      summary: "Read 3 files, wrote 1 file",
      toolIds: ["t1", "t2", "t3"],
    });
    expect(results[0].sessionId).toBe("s1");
  });

  it("parses system status event", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "status",
      status: "compacting",
      uuid: "00000000-0000-0000-0000-000000000003",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "status",
      status: "compacting",
    });
    expect(results[0].sessionId).toBe("s1");
  });

  it("parses system status with null status", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "status",
      status: null,
      uuid: "00000000-0000-0000-0000-000000000003",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "status",
      status: "unknown",
    });
  });

  it("parses task_started event", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "task_started",
      task_id: "task-1",
      description: "Searching for files",
      task_type: "explore",
      uuid: "00000000-0000-0000-0000-000000000004",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "task_started",
      taskId: "task-1",
      description: "Searching for files",
      taskType: "explore",
    });
    expect(results[0].sessionId).toBe("s1");
  });

  it("parses task_started without task_type", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "task_started",
      task_id: "task-2",
      description: "Running analysis",
      uuid: "00000000-0000-0000-0000-000000000005",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "task_started",
      taskId: "task-2",
      description: "Running analysis",
      taskType: undefined,
    });
  });

  it("parses task_notification event", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "task_notification",
      task_id: "task-1",
      status: "completed",
      output_file: "/tmp/output.txt",
      summary: "Found 5 matching files",
      uuid: "00000000-0000-0000-0000-000000000006",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "task_notification",
      taskId: "task-1",
      status: "completed",
      summary: "Found 5 matching files",
    });
    expect(results[0].sessionId).toBe("s1");
  });

  it("parses task_notification with failed status", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "task_notification",
      task_id: "task-2",
      status: "failed",
      output_file: "/tmp/err.txt",
      summary: "Task timed out",
      uuid: "00000000-0000-0000-0000-000000000007",
      session_id: "s1",
    });
    const results = parseLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "task_notification",
      taskId: "task-2",
      status: "failed",
      summary: "Task timed out",
    });
  });

  it("passes through other system subtypes without event", () => {
    for (const subtype of [
      "hook_started",
      "hook_progress",
      "hook_response",
      "compact_boundary",
      "files_persisted",
    ]) {
      const line = JSON.stringify({
        type: "system",
        subtype,
        session_id: "s1",
      });
      const results = parseLine(line);
      expect(results).toHaveLength(1);
      expect(results[0].event).toBeNull();
      expect(results[0].sessionId).toBe("s1");
    }
  });
});
