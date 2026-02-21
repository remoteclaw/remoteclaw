import { afterEach, describe, expect, it } from "vitest";
import { parseOpenCodeLine, resetToolUseCounter } from "./opencode-event-extract.js";

describe("parseOpenCodeLine", () => {
  afterEach(() => {
    resetToolUseCounter();
  });

  it("returns empty array for empty/whitespace lines", () => {
    expect(parseOpenCodeLine("")).toEqual([]);
    expect(parseOpenCodeLine("   ")).toEqual([]);
    expect(parseOpenCodeLine("\n")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseOpenCodeLine("not json")).toEqual([]);
    expect(parseOpenCodeLine("{broken")).toEqual([]);
  });

  it("parses text part into text event", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "text", text: "Here's the solution..." },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({ type: "text", text: "Here's the solution..." });
    expect(results[0].sessionId).toBeUndefined();
    expect(results[0].usage).toBeUndefined();
    expect(results[0].resultMeta).toBeUndefined();
  });

  it("ignores thinking part", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "thinking", text: "Let me analyze..." },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("ignores reasoning part", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "reasoning", text: "First, I need to..." },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("parses tool running state into tool_use event", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Read", state: "running", path: "src/index.ts" },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_use",
      toolId: "opencode-tool-1",
      toolName: "Read",
      input: "src/index.ts",
    });
  });

  it("parses tool running state without path", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Bash", state: "running" },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_use",
      toolId: "opencode-tool-1",
      toolName: "Bash",
      input: "",
    });
  });

  it("parses tool complete state into tool_result event", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Read", state: "complete", result: "[file content]" },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_result",
      toolId: "opencode-tool-1",
      output: "[file content]",
      isError: false,
    });
  });

  it("parses tool complete state without result", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Write", state: "complete" },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_result",
      toolId: "opencode-tool-1",
      output: "",
      isError: false,
    });
  });

  it("parses tool failed state into tool_result with isError=true", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Bash", state: "failed", result: "command not found" },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_result",
      toolId: "opencode-tool-1",
      output: "command not found",
      isError: true,
    });
  });

  it("parses tool failed state without result uses default message", () => {
    const line = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Bash", state: "failed" },
    });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toEqual({
      type: "tool_result",
      toolId: "opencode-tool-1",
      output: "Tool execution failed",
      isError: true,
    });
  });

  it("increments tool IDs across multiple tool events", () => {
    const running = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Read", state: "running", path: "a.ts" },
    });
    const complete = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Read", state: "complete", result: "content" },
    });
    const running2 = JSON.stringify({
      type: "message.part.updated",
      part: { type: "tool", name: "Write", state: "running", path: "b.ts" },
    });

    const r1 = parseOpenCodeLine(running);
    const r2 = parseOpenCodeLine(complete);
    const r3 = parseOpenCodeLine(running2);

    expect((r1[0].event as { toolId: string }).toolId).toBe("opencode-tool-1");
    expect((r2[0].event as { toolId: string }).toolId).toBe("opencode-tool-2");
    expect((r3[0].event as { toolId: string }).toolId).toBe("opencode-tool-3");
  });

  it("returns null event for unknown top-level type", () => {
    const line = JSON.stringify({ type: "unknown_type", data: "whatever" });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("returns null event when part is missing", () => {
    const line = JSON.stringify({ type: "message.part.updated" });
    const results = parseOpenCodeLine(line);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBeNull();
  });

  it("never returns usage or sessionId (not in OpenCode stream)", () => {
    const textLine = JSON.stringify({
      type: "message.part.updated",
      part: { type: "text", text: "hello" },
    });
    const results = parseOpenCodeLine(textLine);
    expect(results[0].sessionId).toBeUndefined();
    expect(results[0].usage).toBeUndefined();
    expect(results[0].resultMeta).toBeUndefined();
  });
});
