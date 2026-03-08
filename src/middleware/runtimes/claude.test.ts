import { beforeEach, describe, expect, it } from "vitest";
import type { AgentDoneEvent, AgentEvent, AgentExecuteParams, AgentRunResult } from "../types.js";
import { ClaudeCliRuntime } from "./claude.js";

// ── Test helper: expose protected methods ───────────────────────────────

class TestableClaudeCliRuntime extends ClaudeCliRuntime {
  public testBuildArgs(params: AgentExecuteParams): string[] {
    return this.buildArgs(params);
  }

  public testExtractEvent(line: string): AgentEvent | null {
    return this.extractEvent(line);
  }

  public testBuildEnv(params: AgentExecuteParams): Record<string, string> {
    return this.buildEnv(params);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<AgentExecuteParams> = {}): AgentExecuteParams {
  return {
    prompt: "Hello, Claude!",
    ...overrides,
  };
}

function streamEventLine(
  innerEvent: Record<string, unknown>,
  envelope: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type: "stream_event",
    uuid: "test-uuid",
    session_id: "sess-abc",
    parent_tool_use_id: null,
    ...envelope,
    event: innerEvent,
  });
}

function makeDoneResult(overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    text: "",
    sessionId: undefined,
    durationMs: 100,
    usage: undefined,
    aborted: false,
    ...overrides,
  };
}

function resultLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "result",
    session_id: "sess-abc",
    cost_usd: 0.042,
    duration_api_ms: 1500,
    num_turns: 3,
    subtype: "end_turn",
    usage: {
      input_tokens: 100,
      output_tokens: 200,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 10,
    },
    ...overrides,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("ClaudeCliRuntime", () => {
  let runtime: TestableClaudeCliRuntime;

  beforeEach(() => {
    runtime = new TestableClaudeCliRuntime();
  });

  // ── buildArgs ─────────────────────────────────────────────────────────

  describe("buildArgs", () => {
    it("produces base flags with --print prompt at the end", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).toEqual([
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--print",
        "Hello, Claude!",
      ]);
    });

    it("adds --resume when sessionId is provided", () => {
      const args = runtime.testBuildArgs(makeParams({ sessionId: "sess-123" }));
      expect(args).toContain("--resume");
      expect(args).toContain("sess-123");
      expect(args.indexOf("--resume")).toBeLessThan(args.indexOf("sess-123"));
    });

    it("does not add --resume when sessionId is absent", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).not.toContain("--resume");
    });

    it("adds --mcp-config with inline JSON when mcpServers has entries", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          mcpServers: {
            myServer: { command: "node", args: ["server.js"], env: { PORT: "3000" } },
          },
        }),
      );

      expect(args).toContain("--mcp-config");
      const configIdx = args.indexOf("--mcp-config");
      const configJson = args[configIdx + 1];
      const parsed = JSON.parse(configJson);
      expect(parsed).toEqual({
        mcpServers: {
          myServer: { command: "node", args: ["server.js"], env: { PORT: "3000" } },
        },
      });
    });

    it("does not add --mcp-config when mcpServers is empty", () => {
      const args = runtime.testBuildArgs(makeParams({ mcpServers: {} }));
      expect(args).not.toContain("--mcp-config");
    });

    it("does not add --mcp-config when mcpServers is undefined", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).not.toContain("--mcp-config");
    });

    it("combines all flags: session + MCP + prompt", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          sessionId: "sess-456",
          mcpServers: { s1: { command: "cmd" } },
        }),
      );

      expect(args).toContain("--output-format");
      expect(args).toContain("stream-json");
      expect(args).toContain("--verbose");
      expect(args).toContain("--resume");
      expect(args).toContain("sess-456");
      expect(args).toContain("--mcp-config");
      // --print prompt comes last
      expect(args[args.length - 2]).toBe("--print");
      expect(args[args.length - 1]).toBe("Hello, Claude!");
    });

    it("places --print prompt at the end", () => {
      const args = runtime.testBuildArgs(makeParams({ prompt: "test prompt" }));
      expect(args[args.length - 2]).toBe("--print");
      expect(args[args.length - 1]).toBe("test prompt");
    });
  });

  // ── extractEvent ──────────────────────────────────────────────────────

  describe("extractEvent", () => {
    it("skips message_start and captures session_id from envelope", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({ type: "message_start", message: {} }, { session_id: "sess-new" }),
      );
      expect(event).toBeNull();
    });

    it("maps text_delta to AgentTextEvent", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello" },
        }),
      );
      expect(event).toEqual({ type: "text", text: "Hello" });
    });

    it("buffers tool_use from content_block_start", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "tool-1", name: "read_file" },
        }),
      );
      // content_block_start for tool_use just buffers, returns null
      expect(event).toBeNull();
    });

    it("accumulates input_json_delta into tool buffer", () => {
      // Start tool buffer
      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "tool-1", name: "read_file" },
        }),
      );

      const event = runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"path":' },
        }),
      );
      expect(event).toBeNull();
    });

    it("emits AgentToolUseEvent on content_block_stop after tool_use", () => {
      // Start tool buffer
      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "tool-1", name: "read_file" },
        }),
      );

      // Accumulate input
      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"path":"/tmp/foo.txt"}' },
        }),
      );

      // Stop block → emit tool event
      const event = runtime.testExtractEvent(
        streamEventLine({ type: "content_block_stop", index: 1 }),
      );

      expect(event).toEqual({
        type: "tool_use",
        toolName: "read_file",
        toolId: "tool-1",
        input: { path: "/tmp/foo.txt" },
      });
    });

    it("skips content_block_stop when no tool is buffered (text block end)", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({ type: "content_block_stop", index: 0 }),
      );
      expect(event).toBeNull();
    });

    it("extracts stop_reason and usage from message_delta", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { input_tokens: 0, output_tokens: 150 },
        }),
      );
      expect(event).toBeNull(); // message_delta is consumed as state, not emitted
    });

    it("maps thinking_delta to AgentThinkingEvent", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "Let me think..." },
        }),
      );
      expect(event).toEqual({ type: "thinking", text: "Let me think..." });
    });

    it("stores result line data and returns null for successful results", () => {
      const event = runtime.testExtractEvent(resultLine());
      expect(event).toBeNull();
    });

    it("emits error event when result line has is_error=true", () => {
      const event = runtime.testExtractEvent(
        resultLine({ is_error: true, result: "Not logged in · Please run /login" }),
      );
      expect(event).toEqual({
        type: "error",
        message: "Not logged in · Please run /login",
        code: "CLI_ERROR",
      });
    });

    it("returns null for is_error result with no result text", () => {
      const event = runtime.testExtractEvent(resultLine({ is_error: true, result: "" }));
      expect(event).toBeNull();
    });

    it("returns null for is_error result with non-string result", () => {
      const event = runtime.testExtractEvent(resultLine({ is_error: true, result: 42 }));
      expect(event).toBeNull();
    });

    it("skips ping events", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({ type: "ping" }, { session_id: "sess-abc" }),
      );
      expect(event).toBeNull();
    });

    it("skips unknown event types", () => {
      const event = runtime.testExtractEvent(JSON.stringify({ type: "unknown_type", data: {} }));
      expect(event).toBeNull();
    });

    it("skips content_block_start for text blocks", () => {
      const event = runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      );
      expect(event).toBeNull();
    });

    it("accumulates text across multiple text_delta events", () => {
      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello " },
        }),
      );

      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "World" },
        }),
      );

      runtime.testExtractEvent(resultLine());

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );
      expect(doneEvent.result.text).toBe("Hello World");
    });

    it("handles tool_use with empty input", () => {
      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "tool-2", name: "list_files" },
        }),
      );

      // Stop immediately (no input_json_delta)
      const event = runtime.testExtractEvent(
        streamEventLine({ type: "content_block_stop", index: 1 }),
      );

      expect(event).toEqual({
        type: "tool_use",
        toolName: "list_files",
        toolId: "tool-2",
        input: {},
      });
    });

    it("handles tool_use with multi-chunk input", () => {
      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "tool-3", name: "write_file" },
        }),
      );

      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"path":' },
        }),
      );

      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '"/tmp/file.txt",' },
        }),
      );

      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '"content":"data"}' },
        }),
      );

      const event = runtime.testExtractEvent(
        streamEventLine({ type: "content_block_stop", index: 1 }),
      );

      expect(event).toEqual({
        type: "tool_use",
        toolName: "write_file",
        toolId: "tool-3",
        input: { path: "/tmp/file.txt", content: "data" },
      });
    });

    it("captures session_id from first stream_event only", () => {
      // First event sets session_id
      runtime.testExtractEvent(
        streamEventLine({ type: "message_start", message: {} }, { session_id: "first-session" }),
      );

      // Second event with different session_id is ignored
      runtime.testExtractEvent(
        streamEventLine(
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } },
          { session_id: "second-session" },
        ),
      );

      // Result has no session_id — enrichment should use the first envelope's
      runtime.testExtractEvent(resultLine({ session_id: undefined }));

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );
      expect(doneEvent.result.sessionId).toBe("first-session");
    });
  });

  // ── buildEnv ──────────────────────────────────────────────────────────

  describe("buildEnv", () => {
    it("returns empty record", () => {
      const env = runtime.testBuildEnv(makeParams());
      expect(env).toEqual({});
    });

    it("does not inject auth vars regardless of params", () => {
      const env = runtime.testBuildEnv(makeParams({ env: { ANTHROPIC_API_KEY: "sk-test" } }));
      // buildEnv returns runtime-specific env, not caller env.
      // Auth vars in params.env are handled by CLIRuntimeBase.
      expect(env).toEqual({});
      expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    });
  });

  // ── MCP config inline JSON ───────────────────────────────────────────

  describe("MCP config inline JSON", () => {
    it("passes inline JSON string with correct structure for multiple servers", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          mcpServers: {
            server1: { command: "node", args: ["s1.js"] },
            server2: { command: "python", args: ["s2.py"], env: { KEY: "val" } },
          },
        }),
      );

      const configIdx = args.indexOf("--mcp-config");
      expect(configIdx).toBeGreaterThan(-1);
      const configJson = args[configIdx + 1];
      const parsed = JSON.parse(configJson);
      expect(parsed).toEqual({
        mcpServers: {
          server1: { command: "node", args: ["s1.js"] },
          server2: { command: "python", args: ["s2.py"], env: { KEY: "val" } },
        },
      });
    });

    it("passes valid JSON for minimal server config", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          mcpServers: { s: { command: "node" } },
        }),
      );

      const configIdx = args.indexOf("--mcp-config");
      const configJson = args[configIdx + 1];
      const parsed = JSON.parse(configJson);
      expect(parsed).toEqual({
        mcpServers: { s: { command: "node" } },
      });
    });
  });

  // ── Integration: enrichDoneEvent ──────────────────────────────────────

  describe("done event enrichment", () => {
    it("enriches done event with accumulated text, session, usage, and result metadata", () => {
      // Simulate a stream sequence
      runtime.testExtractEvent(
        streamEventLine({ type: "message_start", message: {} }, { session_id: "sess-enrich" }),
      );

      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello " },
        }),
      );

      runtime.testExtractEvent(
        streamEventLine({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "World" },
        }),
      );

      runtime.testExtractEvent(
        streamEventLine({
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 50 },
        }),
      );

      runtime.testExtractEvent(
        resultLine({
          session_id: "sess-enrich",
          cost_usd: 0.05,
          duration_api_ms: 2000,
          num_turns: 2,
          subtype: "end_turn",
          usage: {
            input_tokens: 300,
            output_tokens: 150,
            cache_read_input_tokens: 100,
          },
        }),
      );

      // Create a minimal done event (like CLIRuntimeBase would)
      const doneEvent: AgentDoneEvent = {
        type: "done",
        result: makeDoneResult({ durationMs: 5000 }),
      };

      // Call enrichDoneEvent via the instance
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.text).toBe("Hello World");
      expect(doneEvent.result.sessionId).toBe("sess-enrich");
      expect(doneEvent.result.stopReason).toBe("end_turn");
      expect(doneEvent.result.totalCostUsd).toBe(0.05);
      expect(doneEvent.result.apiDurationMs).toBe(2000);
      expect(doneEvent.result.numTurns).toBe(2);
      // Result-line usage preferred over message_delta usage
      expect(doneEvent.result.usage).toEqual({
        inputTokens: 300,
        outputTokens: 150,
        cacheReadTokens: 100,
      });
      // durationMs preserved from base class
      expect(doneEvent.result.durationMs).toBe(5000);
      expect(doneEvent.result.aborted).toBe(false);
    });

    it("falls back to envelope session_id when result has none", () => {
      runtime.testExtractEvent(
        streamEventLine({ type: "message_start", message: {} }, { session_id: "from-envelope" }),
      );

      runtime.testExtractEvent(resultLine({ session_id: undefined }));

      const doneEvent: AgentDoneEvent = {
        type: "done",
        result: makeDoneResult(),
      };

      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.sessionId).toBe("from-envelope");
    });

    it("falls back to message_delta usage when result has no usage", () => {
      runtime.testExtractEvent(
        streamEventLine({
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { input_tokens: 0, output_tokens: 75 },
        }),
      );

      // Result line without usage
      runtime.testExtractEvent(resultLine({ usage: undefined }));

      const doneEvent: AgentDoneEvent = {
        type: "done",
        result: makeDoneResult(),
      };

      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.usage).toEqual({
        inputTokens: 0,
        outputTokens: 75,
      });
    });
  });
});
