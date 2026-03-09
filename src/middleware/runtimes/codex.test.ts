import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentDoneEvent, AgentEvent, AgentExecuteParams, AgentRunResult } from "../types.js";
import { CodexCliRuntime, CodexMcpConfigManager, serializeMcpServersToToml } from "./codex.js";

// ── Test helper: expose protected methods ───────────────────────────────

class TestableCodexCliRuntime extends CodexCliRuntime {
  public testBuildArgs(params: AgentExecuteParams): string[] {
    return this.buildArgs(params);
  }

  public testExtractEvent(line: string): AgentEvent | null {
    return this.extractEvent(line);
  }

  public testBuildEnv(params: AgentExecuteParams): Record<string, string> {
    return this.buildEnv(params);
  }

  public get testSupportsStdinPrompt(): boolean {
    return this.supportsStdinPrompt;
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<AgentExecuteParams> = {}): AgentExecuteParams {
  return {
    prompt: "Hello, Codex!",
    ...overrides,
  };
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

function codexEvent(type: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, ...fields });
}

function itemEvent(
  eventType: string,
  itemType: string,
  itemFields: Record<string, unknown> = {},
  eventFields: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type: eventType,
    item: { type: itemType, ...itemFields },
    ...eventFields,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("CodexCliRuntime", () => {
  let runtime: TestableCodexCliRuntime;

  beforeEach(() => {
    runtime = new TestableCodexCliRuntime();
  });

  // ── supportsStdinPrompt ─────────────────────────────────────────────

  describe("supportsStdinPrompt", () => {
    it("returns false", () => {
      expect(runtime.testSupportsStdinPrompt).toBe(false);
    });
  });

  // ── buildArgs ─────────────────────────────────────────────────────────

  describe("buildArgs", () => {
    it("produces exec --json --color never <prompt> for new session", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).toEqual(["exec", "--json", "--color", "never", "Hello, Codex!"]);
    });

    it("produces exec resume --json <id> <prompt> for session resume", () => {
      const args = runtime.testBuildArgs(makeParams({ sessionId: "thread-abc-123" }));
      expect(args).toEqual(["exec", "resume", "--json", "thread-abc-123", "Hello, Codex!"]);
    });

    it("includes prompt on session resume", () => {
      const args = runtime.testBuildArgs(
        makeParams({ sessionId: "thread-abc-123", prompt: "Follow-up message" }),
      );
      expect(args).toContain("Follow-up message");
    });

    it("always starts with exec", () => {
      const newArgs = runtime.testBuildArgs(makeParams());
      expect(newArgs[0]).toBe("exec");

      const resumeArgs = runtime.testBuildArgs(makeParams({ sessionId: "sess-1" }));
      expect(resumeArgs[0]).toBe("exec");
    });

    it("includes --color never for new sessions", () => {
      const newArgs = runtime.testBuildArgs(makeParams());
      const colorIdx = newArgs.indexOf("--color");
      expect(colorIdx).toBeGreaterThan(-1);
      expect(newArgs[colorIdx + 1]).toBe("never");
    });

    it("does not include --color for resume (unsupported by resume subcommand)", () => {
      const resumeArgs = runtime.testBuildArgs(makeParams({ sessionId: "s" }));
      expect(resumeArgs).not.toContain("--color");
    });

    it("always includes --json", () => {
      const newArgs = runtime.testBuildArgs(makeParams());
      expect(newArgs).toContain("--json");

      const resumeArgs = runtime.testBuildArgs(makeParams({ sessionId: "s" }));
      expect(resumeArgs).toContain("--json");
    });

    it("does not include --mcp-config flag (MCP handled via config file)", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          mcpServers: { s1: { command: "node" } },
        }),
      );
      expect(args).not.toContain("--mcp-config");
    });

    it("appends --image flag for image media with filePath", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          media: [{ mimeType: "image/png", filePath: "/tmp/photo.png" }],
        }),
      );
      const imageIdx = args.indexOf("--image");
      expect(imageIdx).toBeGreaterThan(-1);
      expect(args[imageIdx + 1]).toBe("/tmp/photo.png");
    });

    it("appends multiple --image flags for multiple images", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          media: [
            { mimeType: "image/png", filePath: "/tmp/a.png" },
            { mimeType: "image/jpeg", filePath: "/tmp/b.jpg" },
          ],
        }),
      );
      const imageIndices = args.reduce<number[]>((acc, arg, i) => {
        if (arg === "--image") {
          acc.push(i);
        }
        return acc;
      }, []);
      expect(imageIndices).toHaveLength(2);
      expect(args[imageIndices[0] + 1]).toBe("/tmp/a.png");
      expect(args[imageIndices[1] + 1]).toBe("/tmp/b.jpg");
    });

    it("inserts -- separator before prompt when images are present", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          prompt: "Describe this",
          media: [{ mimeType: "image/png", filePath: "/tmp/photo.png" }],
        }),
      );
      const separatorIdx = args.indexOf("--");
      expect(separatorIdx).toBeGreaterThan(-1);
      expect(args[separatorIdx + 1]).toContain("Describe this");
    });

    it("does not insert -- separator when no images are present", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).not.toContain("--");
    });

    it("does not include --image when no media is provided", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).not.toContain("--image");
    });

    it("filters non-image media (no --image for audio/video)", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          media: [
            { mimeType: "audio/ogg", filePath: "/tmp/audio.ogg" },
            { mimeType: "video/mp4", filePath: "/tmp/video.mp4" },
          ],
        }),
      );
      expect(args).not.toContain("--image");
    });

    it("skips image media without filePath", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          media: [{ mimeType: "image/png", base64: "aW1hZ2U=" }],
        }),
      );
      expect(args).not.toContain("--image");
    });

    it("forces new session with --image when images are present on resume", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          sessionId: "thread-abc",
          media: [{ mimeType: "image/png", filePath: "/tmp/photo.png" }],
        }),
      );
      // Resume subcommand does not support --image, so force a new session
      expect(args).not.toContain("resume");
      expect(args).not.toContain("thread-abc");
      expect(args).toContain("--image");
      expect(args[args.indexOf("--image") + 1]).toBe("/tmp/photo.png");
    });

    it("includes thread context when forcing new session for images on resume", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          sessionId: "thread-abc",
          threadContext: "Previous conversation context",
          media: [{ mimeType: "image/png", filePath: "/tmp/photo.png" }],
        }),
      );
      const prompt = args[args.length - 1];
      expect(prompt).toContain("Previous conversation context");
    });

    it("places --image flags before the prompt", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          prompt: "Describe this",
          media: [{ mimeType: "image/jpeg", filePath: "/tmp/img.jpg" }],
        }),
      );
      const imageIdx = args.indexOf("--image");
      const promptIdx = args.indexOf("Describe this");
      expect(imageIdx).toBeLessThan(promptIdx);
    });
  });

  // ── mediaCapabilities ─────────────────────────────────────────────────

  describe("mediaCapabilities", () => {
    it("accepts inbound images", () => {
      expect(runtime.mediaCapabilities.acceptsInbound).toEqual(["image/"]);
    });

    it("does not emit outbound media", () => {
      expect(runtime.mediaCapabilities.emitsOutbound).toBe(false);
    });
  });

  // ── extractEvent ──────────────────────────────────────────────────────

  describe("extractEvent", () => {
    it("captures thread_id from thread.started and returns null", () => {
      const event = runtime.testExtractEvent(
        codexEvent("thread.started", { thread_id: "thread-xyz" }),
      );
      expect(event).toBeNull();
    });

    it("skips turn.started", () => {
      const event = runtime.testExtractEvent(codexEvent("turn.started"));
      expect(event).toBeNull();
    });

    it("maps item.started + command_execution to AgentToolUseEvent", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.started", "command_execution", {
          id: "cmd-1",
          command: "ls -la",
        }),
      );
      expect(event).toEqual({
        type: "tool_use",
        toolName: "command_execution",
        toolId: "cmd-1",
        input: { command: "ls -la" },
      });
    });

    it("maps item.started + mcp_tool_call to AgentToolUseEvent with tool name and arguments", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.started", "mcp_tool_call", {
          id: "mcp-1",
          name: "read_file",
          arguments: { path: "/tmp/test.txt" },
        }),
      );
      expect(event).toEqual({
        type: "tool_use",
        toolName: "read_file",
        toolId: "mcp-1",
        input: { path: "/tmp/test.txt" },
      });
    });

    it("skips item.started + agent_message", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.started", "agent_message", { id: "msg-1" }),
      );
      expect(event).toBeNull();
    });

    it("skips item.started + reasoning (no content yet)", () => {
      const event = runtime.testExtractEvent(itemEvent("item.started", "reasoning", { id: "r-1" }));
      expect(event).toBeNull();
    });

    it("maps item.completed + reasoning to AgentThinkingEvent", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "reasoning", {
          id: "r-1",
          summary: [{ type: "summary_text", text: "Let me reason..." }],
        }),
      );
      expect(event).toEqual({ type: "thinking", text: "Let me reason..." });
    });

    it("maps item.completed + reasoning with text fallback to AgentThinkingEvent", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "reasoning", {
          id: "r-2",
          text: "Thinking through this...",
        }),
      );
      expect(event).toEqual({ type: "thinking", text: "Thinking through this..." });
    });

    it("maps item.updated + reasoning to AgentThinkingEvent", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.updated", "reasoning", {
          id: "r-3",
          text: "Partial reasoning",
        }),
      );
      expect(event).toEqual({ type: "thinking", text: "Partial reasoning" });
    });

    it("maps item.updated + agent_message to AgentTextEvent with delta", () => {
      // Start a message item to initialize delta tracking
      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));

      const event = runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello " }],
        }),
      );
      expect(event).toEqual({ type: "text", text: "Hello " });
    });

    it("computes correct incremental deltas across multiple item.updated events", () => {
      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));

      const event1 = runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello " }],
        }),
      );
      expect(event1).toEqual({ type: "text", text: "Hello " });

      const event2 = runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello World" }],
        }),
      );
      expect(event2).toEqual({ type: "text", text: "World" });

      const event3 = runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello World!" }],
        }),
      );
      expect(event3).toEqual({ type: "text", text: "!" });
    });

    it("skips item.updated for non-agent_message types", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.updated", "command_execution", { id: "cmd-1" }),
      );
      expect(event).toBeNull();
    });

    it("returns null for item.updated with no new delta", () => {
      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));

      runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello" }],
        }),
      );

      // Same text — no delta
      const event = runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello" }],
        }),
      );
      expect(event).toBeNull();
    });

    it("maps item.completed + agent_message to final delta AgentTextEvent", () => {
      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));

      runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello" }],
        }),
      );

      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello World" }],
        }),
      );
      expect(event).toEqual({ type: "text", text: " World" });
    });

    it("returns null for item.completed + agent_message with no remaining delta", () => {
      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));

      runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello" }],
        }),
      );

      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello" }],
        }),
      );
      expect(event).toBeNull();
    });

    it("maps item.completed + command_execution to AgentToolResultEvent", () => {
      // Start the command first
      runtime.testExtractEvent(
        itemEvent("item.started", "command_execution", { id: "cmd-1", command: "ls" }),
      );

      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "command_execution", {
          id: "cmd-1",
          output: "file1.txt\nfile2.txt",
          exit_code: 0,
        }),
      );
      expect(event).toEqual({
        type: "tool_result",
        toolId: "cmd-1",
        output: "file1.txt\nfile2.txt",
        isError: false,
      });
    });

    it("marks command_execution as error when exit_code is non-zero", () => {
      runtime.testExtractEvent(
        itemEvent("item.started", "command_execution", { id: "cmd-2", command: "false" }),
      );

      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "command_execution", {
          id: "cmd-2",
          output: "command failed",
          exit_code: 1,
        }),
      );
      expect(event).toEqual({
        type: "tool_result",
        toolId: "cmd-2",
        output: "command failed",
        isError: true,
      });
    });

    it("maps item.completed + mcp_tool_call to AgentToolResultEvent", () => {
      runtime.testExtractEvent(
        itemEvent("item.started", "mcp_tool_call", {
          id: "mcp-1",
          name: "read_file",
          arguments: { path: "/tmp/test.txt" },
        }),
      );

      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "mcp_tool_call", {
          id: "mcp-1",
          output: "file contents",
        }),
      );
      expect(event).toEqual({
        type: "tool_result",
        toolId: "mcp-1",
        output: "file contents",
        isError: false,
      });
    });

    it("marks mcp_tool_call as error when error field is present", () => {
      runtime.testExtractEvent(
        itemEvent("item.started", "mcp_tool_call", {
          id: "mcp-2",
          name: "write_file",
          arguments: {},
        }),
      );

      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "mcp_tool_call", {
          id: "mcp-2",
          output: "",
          error: "Permission denied",
        }),
      );
      expect(event).toEqual({
        type: "tool_result",
        toolId: "mcp-2",
        output: "",
        isError: true,
      });
    });

    it("maps item.completed + error to AgentErrorEvent", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "error", {
          id: "err-1",
          message: "Rate limit exceeded",
        }),
      );
      expect(event).toEqual({
        type: "error",
        message: "Rate limit exceeded",
      });
    });

    it("stores usage from turn.completed and returns null", () => {
      const event = runtime.testExtractEvent(
        codexEvent("turn.completed", {
          usage: {
            input_tokens: 500,
            output_tokens: 200,
            cached_input_tokens: 100,
          },
        }),
      );
      expect(event).toBeNull();
    });

    it("maps turn.failed to AgentErrorEvent", () => {
      const event = runtime.testExtractEvent(
        codexEvent("turn.failed", { message: "Context window exceeded" }),
      );
      expect(event).toEqual({
        type: "error",
        message: "Context window exceeded",
        code: "turn_failed",
      });
    });

    it("maps stream-level error to AgentErrorEvent", () => {
      const event = runtime.testExtractEvent(codexEvent("error", { message: "Connection lost" }));
      expect(event).toEqual({
        type: "error",
        message: "Connection lost",
      });
    });

    it("skips unknown event types", () => {
      const event = runtime.testExtractEvent(codexEvent("unknown_type", { data: "foo" }));
      expect(event).toBeNull();
    });

    it("generates tool IDs when item.id is missing", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.started", "command_execution", { command: "pwd" }),
      );
      expect(event).not.toBeNull();
      expect((event as { toolId: string }).toolId).toMatch(/^codex-item-\d+$/);
    });

    it("skips item.completed for file_change", () => {
      const event = runtime.testExtractEvent(
        itemEvent("item.completed", "file_change", { id: "fc-1" }),
      );
      expect(event).toBeNull();
    });

    it("handles agent_message with text field fallback", () => {
      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));

      const event = runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          text: "Fallback text",
        }),
      );
      expect(event).toEqual({ type: "text", text: "Fallback text" });
    });
  });

  // ── buildEnv ──────────────────────────────────────────────────────────

  describe("buildEnv", () => {
    it("returns empty record", () => {
      const env = runtime.testBuildEnv(makeParams());
      expect(env).toEqual({});
    });

    it("does not inject auth vars regardless of params", () => {
      const env = runtime.testBuildEnv(makeParams({ env: { OPENAI_API_KEY: "sk-test" } }));
      expect(env).toEqual({});
      expect(env).not.toHaveProperty("OPENAI_API_KEY");
    });
  });

  // ── done event enrichment ─────────────────────────────────────────────

  describe("done event enrichment", () => {
    it("enriches done event with accumulated text, session ID, and usage", () => {
      // thread.started → session ID
      runtime.testExtractEvent(codexEvent("thread.started", { thread_id: "thread-enrich" }));

      // Message deltas → accumulated text
      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));
      runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello " }],
        }),
      );
      runtime.testExtractEvent(
        itemEvent("item.completed", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "Hello World" }],
        }),
      );

      // turn.completed → usage
      runtime.testExtractEvent(
        codexEvent("turn.completed", {
          usage: {
            input_tokens: 300,
            output_tokens: 200,
            cached_input_tokens: 50,
          },
        }),
      );

      const doneEvent: AgentDoneEvent = {
        type: "done",
        result: makeDoneResult({ durationMs: 5000 }),
      };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.text).toBe("Hello World");
      expect(doneEvent.result.sessionId).toBe("thread-enrich");
      expect(doneEvent.result.usage).toEqual({
        inputTokens: 300,
        outputTokens: 200,
        cacheReadTokens: 50,
      });
      expect(doneEvent.result.durationMs).toBe(5000);
      expect(doneEvent.result.aborted).toBe(false);
    });

    it("handles missing usage gracefully", () => {
      runtime.testExtractEvent(codexEvent("thread.started", { thread_id: "thread-no-usage" }));

      runtime.testExtractEvent(itemEvent("item.started", "agent_message", { id: "msg-1" }));
      runtime.testExtractEvent(
        itemEvent("item.updated", "agent_message", {
          id: "msg-1",
          content: [{ type: "output_text", text: "response" }],
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.text).toBe("response");
      expect(doneEvent.result.sessionId).toBe("thread-no-usage");
      expect(doneEvent.result.usage).toBeUndefined();
    });

    it("uses last turn's usage when multiple turns occur", () => {
      // First turn
      runtime.testExtractEvent(
        codexEvent("turn.completed", {
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      );

      // Second turn (should override)
      runtime.testExtractEvent(
        codexEvent("turn.completed", {
          usage: { input_tokens: 400, output_tokens: 250, cached_input_tokens: 75 },
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.usage).toEqual({
        inputTokens: 400,
        outputTokens: 250,
        cacheReadTokens: 75,
      });
    });

    it("does not include cacheReadTokens when cached_input_tokens is 0", () => {
      runtime.testExtractEvent(
        codexEvent("turn.completed", {
          usage: { input_tokens: 100, output_tokens: 50, cached_input_tokens: 0 },
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
      });
      expect(doneEvent.result.usage).not.toHaveProperty("cacheReadTokens");
    });
  });

  // ── TOML serialization ────────────────────────────────────────────────

  describe("serializeMcpServersToToml", () => {
    it("serializes a single server with command only", () => {
      const toml = serializeMcpServersToToml({
        myServer: { command: "node" },
      });

      expect(toml).toBe(`[mcp_servers.myServer]\ntype = "stdio"\ncommand = "node"\n`);
    });

    it("serializes command as string and args as separate array", () => {
      const toml = serializeMcpServersToToml({
        myServer: { command: "node", args: ["server.js", "--port", "3000"] },
      });

      expect(toml).toContain(`command = "node"`);
      expect(toml).toContain(`args = ["server.js", "--port", "3000"]`);
    });

    it("serializes env vars as sub-table", () => {
      const toml = serializeMcpServersToToml({
        myServer: {
          command: "node",
          args: ["server.js"],
          env: { API_KEY: "secret", DEBUG: "true" },
        },
      });

      expect(toml).toContain("[mcp_servers.myServer.env]");
      expect(toml).toContain(`API_KEY = "secret"`);
      expect(toml).toContain(`DEBUG = "true"`);
    });

    it("serializes multiple servers", () => {
      const toml = serializeMcpServersToToml({
        server1: { command: "node", args: ["s1.js"] },
        server2: { command: "python", args: ["s2.py"] },
      });

      expect(toml).toContain("[mcp_servers.server1]");
      expect(toml).toContain("[mcp_servers.server2]");
      expect(toml).toContain(`command = "node"`);
      expect(toml).toContain(`args = ["s1.js"]`);
      expect(toml).toContain(`command = "python"`);
      expect(toml).toContain(`args = ["s2.py"]`);
    });

    it("escapes special characters in TOML strings", () => {
      const toml = serializeMcpServersToToml({
        s: { command: "node", args: ['path with "quotes"', "path\\with\\backslashes"] },
      });

      expect(toml).toContain(`command = "node"`);
      expect(toml).toContain(`"path with \\"quotes\\""`);
      expect(toml).toContain(`"path\\\\with\\\\backslashes"`);
    });
  });

  // ── MCP config file management ────────────────────────────────────────

  describe("CodexMcpConfigManager", () => {
    let testDir: string;
    let codexDir: string;
    let configPath: string;

    beforeEach(async () => {
      testDir = join(
        tmpdir(),
        `codex-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await mkdir(testDir, { recursive: true });
      codexDir = join(testDir, "codex-config");
      configPath = join(codexDir, "config.toml");
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("creates TOML config file when mcpServers has entries", async () => {
      const manager = new CodexMcpConfigManager(
        { myServer: { command: "node", args: ["server.js"] } },
        codexDir,
      );

      await manager.setup();

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("[mcp_servers.myServer]");
      expect(content).toContain('type = "stdio"');
      expect(content).toContain('command = "node"');
      expect(content).toContain('args = ["server.js"]');

      await manager.teardown();
    });

    it("cleans up created file on teardown", async () => {
      const manager = new CodexMcpConfigManager({ s: { command: "cmd" } }, codexDir);

      await manager.setup();

      // File exists
      await expect(readFile(configPath, "utf-8")).resolves.toBeTruthy();

      await manager.teardown();

      // File should be removed
      await expect(readFile(configPath, "utf-8")).rejects.toThrow();
    });

    it("preserves existing config and restores on teardown", async () => {
      // Create existing config
      await mkdir(codexDir, { recursive: true });
      const originalContent = '[settings]\nmodel = "o3"\n';
      await writeFile(configPath, originalContent, "utf-8");

      const manager = new CodexMcpConfigManager(
        { newServer: { command: "python", args: ["serve.py"] } },
        codexDir,
      );

      await manager.setup();

      // Should have merged content
      const merged = await readFile(configPath, "utf-8");
      expect(merged).toContain("[settings]");
      expect(merged).toContain("[mcp_servers.newServer]");

      await manager.teardown();

      // Should restore original
      const restored = await readFile(configPath, "utf-8");
      expect(restored).toBe(originalContent);
    });

    it("writes correct TOML structure with command array from McpServerConfig", async () => {
      const manager = new CodexMcpConfigManager(
        {
          server1: { command: "node", args: ["s1.js"] },
          server2: { command: "python", args: ["s2.py"], env: { KEY: "val" } },
        },
        codexDir,
      );

      await manager.setup();

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("[mcp_servers.server1]");
      expect(content).toContain("[mcp_servers.server2]");
      expect(content).toContain('command = "node"');
      expect(content).toContain('args = ["s1.js"]');
      expect(content).toContain('command = "python"');
      expect(content).toContain('args = ["s2.py"]');
      expect(content).toContain("[mcp_servers.server2.env]");
      expect(content).toContain('KEY = "val"');

      await manager.teardown();
    });
  });
});
