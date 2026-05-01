import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentDoneEvent, AgentEvent, AgentExecuteParams, AgentRunResult } from "../types.js";
import { OpenCodeCliRuntime, OpenCodeMcpConfigManager } from "./opencode.js";

// ── Test helper: expose protected methods ───────────────────────────────

class TestableOpenCodeCliRuntime extends OpenCodeCliRuntime {
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

  public get testPendingEvents(): AgentEvent[] {
    return (this as unknown as { pendingEvents: AgentEvent[] }).pendingEvents;
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<AgentExecuteParams> = {}): AgentExecuteParams {
  return {
    prompt: "Hello, OpenCode!",
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

function openCodeEvent(type: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type,
    timestamp: "2026-02-25T10:00:00Z",
    sessionID: "sess-abc",
    ...fields,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("OpenCodeCliRuntime", () => {
  let runtime: TestableOpenCodeCliRuntime;

  beforeEach(() => {
    runtime = new TestableOpenCodeCliRuntime();
  });

  // ── supportsStdinPrompt ─────────────────────────────────────────────

  describe("supportsStdinPrompt", () => {
    it("returns true (default from base class)", () => {
      expect(runtime.testSupportsStdinPrompt).toBe(true);
    });
  });

  // ── buildArgs ─────────────────────────────────────────────────────────

  describe("buildArgs", () => {
    it("produces run --format json <prompt> for new session", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).toEqual(["run", "--format", "json", "Hello, OpenCode!"]);
    });

    it("produces run --format json --session <id> <prompt> for session resume", () => {
      const args = runtime.testBuildArgs(makeParams({ sessionId: "sess-123" }));
      expect(args).toEqual([
        "run",
        "--format",
        "json",
        "--session",
        "sess-123",
        "Hello, OpenCode!",
      ]);
    });

    it("includes prompt on session resume", () => {
      const args = runtime.testBuildArgs(
        makeParams({ sessionId: "sess-123", prompt: "Follow up prompt" }),
      );
      expect(args).toContain("Follow up prompt");
    });

    it("always starts with run", () => {
      const newArgs = runtime.testBuildArgs(makeParams());
      expect(newArgs[0]).toBe("run");

      const resumeArgs = runtime.testBuildArgs(makeParams({ sessionId: "sess-1" }));
      expect(resumeArgs[0]).toBe("run");
    });

    it("always includes --format json", () => {
      const newArgs = runtime.testBuildArgs(makeParams());
      const formatIdx = newArgs.indexOf("--format");
      expect(formatIdx).toBeGreaterThan(-1);
      expect(newArgs[formatIdx + 1]).toBe("json");

      const resumeArgs = runtime.testBuildArgs(makeParams({ sessionId: "s" }));
      const resumeFormatIdx = resumeArgs.indexOf("--format");
      expect(resumeFormatIdx).toBeGreaterThan(-1);
      expect(resumeArgs[resumeFormatIdx + 1]).toBe("json");
    });

    it("does not include --mcp-config flag (MCP handled via config file)", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          mcpServers: { s1: { command: "node" } },
        }),
      );
      expect(args).not.toContain("--mcp-config");
    });
  });

  // ── extractEvent ──────────────────────────────────────────────────────

  describe("extractEvent", () => {
    it("extracts sessionID from envelope and returns appropriate event", () => {
      const event = runtime.testExtractEvent(
        openCodeEvent("text", { content: "Hello", sessionID: "sess-xyz" }),
      );
      expect(event).toEqual({ type: "text", text: "Hello" });
    });

    it("maps text event to AgentTextEvent with complete text chunk", () => {
      const event = runtime.testExtractEvent(openCodeEvent("text", { content: "Hello there!" }));
      expect(event).toEqual({ type: "text", text: "Hello there!" });
    });

    it("accumulates text across multiple text events", () => {
      runtime.testExtractEvent(openCodeEvent("text", { content: "Hello " }));
      runtime.testExtractEvent(openCodeEvent("text", { content: "World" }));

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );
      expect(doneEvent.result.text).toBe("Hello World");
    });

    it("maps tool_use event to AgentToolUseEvent and buffers AgentToolResultEvent", () => {
      const event = runtime.testExtractEvent(
        openCodeEvent("tool_use", {
          name: "read_file",
          callID: "call-123",
          input: { path: "/tmp/test.txt" },
          state: { output: "file contents", error: "" },
        }),
      );

      expect(event).toEqual({
        type: "tool_use",
        toolName: "read_file",
        toolId: "call-123",
        input: { path: "/tmp/test.txt" },
      });

      // Check buffered tool_result
      expect(runtime.testPendingEvents).toHaveLength(1);
      expect(runtime.testPendingEvents[0]).toEqual({
        type: "tool_result",
        toolId: "call-123",
        output: "file contents",
        isError: false,
      });
    });

    it("uses callID as toolId when present", () => {
      const event = runtime.testExtractEvent(
        openCodeEvent("tool_use", {
          name: "write_file",
          callID: "call-456",
          input: {},
          state: { output: "", error: "" },
        }),
      );
      expect((event as { toolId: string }).toolId).toBe("call-456");
    });

    it("generates fallback opencode-tool-N IDs when callID is missing", () => {
      const event1 = runtime.testExtractEvent(
        openCodeEvent("tool_use", {
          name: "tool1",
          input: {},
          state: { output: "", error: "" },
        }),
      );
      expect((event1 as { toolId: string }).toolId).toBe("opencode-tool-0");

      const event2 = runtime.testExtractEvent(
        openCodeEvent("tool_use", {
          name: "tool2",
          input: {},
          state: { output: "", error: "" },
        }),
      );
      expect((event2 as { toolId: string }).toolId).toBe("opencode-tool-1");
    });

    it("marks tool_result as error when state.error is non-empty", () => {
      runtime.testExtractEvent(
        openCodeEvent("tool_use", {
          name: "read_file",
          callID: "call-err",
          input: { path: "/nonexistent" },
          state: { output: "", error: "File not found" },
        }),
      );

      expect(runtime.testPendingEvents).toHaveLength(1);
      expect(runtime.testPendingEvents[0]).toEqual({
        type: "tool_result",
        toolId: "call-err",
        output: "",
        isError: true,
      });
    });

    it("stores usage from step_finish and returns null", () => {
      const event = runtime.testExtractEvent(
        openCodeEvent("step_finish", {
          tokens: {
            input: 500,
            output: 200,
            reasoning: 50,
            total: 750,
            cache: { read: 100, write: 25 },
          },
          cost: 0.0042,
          reason: "end_turn",
        }),
      );
      expect(event).toBeNull();
    });

    it("stores cost from step_finish and returns null", () => {
      runtime.testExtractEvent(
        openCodeEvent("step_finish", {
          tokens: { input: 100, output: 50 },
          cost: 0.0015,
          reason: "end_turn",
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );
      expect(doneEvent.result.totalCostUsd).toBe(0.0015);
    });

    it("stores stop reason from step_finish and returns null", () => {
      runtime.testExtractEvent(
        openCodeEvent("step_finish", {
          tokens: { input: 100, output: 50 },
          cost: 0.001,
          reason: "max_tokens",
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );
      expect(doneEvent.result.stopReason).toBe("max_tokens");
    });

    it("skips step_start events", () => {
      const event = runtime.testExtractEvent(openCodeEvent("step_start"));
      expect(event).toBeNull();
    });

    it("maps reasoning event to AgentThinkingEvent", () => {
      const event = runtime.testExtractEvent(
        openCodeEvent("reasoning", { content: "thinking..." }),
      );
      expect(event).toEqual({ type: "thinking", text: "thinking..." });
    });

    it("maps reasoning event with text field to AgentThinkingEvent", () => {
      const event = runtime.testExtractEvent(
        openCodeEvent("reasoning", { part: { text: "reasoning text" } }),
      );
      expect(event).toEqual({ type: "thinking", text: "reasoning text" });
    });

    it("returns null for reasoning event with empty content", () => {
      const event = runtime.testExtractEvent(openCodeEvent("reasoning", { content: "" }));
      expect(event).toBeNull();
    });

    it("maps error event to AgentErrorEvent", () => {
      const event = runtime.testExtractEvent(
        openCodeEvent("error", { message: "Rate limit exceeded" }),
      );
      expect(event).toEqual({
        type: "error",
        message: "Rate limit exceeded",
      });
    });

    it("skips unknown event types", () => {
      const event = runtime.testExtractEvent(openCodeEvent("unknown_type", { data: "foo" }));
      expect(event).toBeNull();
    });

    it("handles missing/malformed fields gracefully", () => {
      // text with no content field
      const textEvent = runtime.testExtractEvent(openCodeEvent("text"));
      expect(textEvent).toEqual({ type: "text", text: "" });

      // tool_use with no name, callID, input, or state
      const toolEvent = runtime.testExtractEvent(openCodeEvent("tool_use"));
      expect(toolEvent).toEqual({
        type: "tool_use",
        toolName: "",
        toolId: "opencode-tool-0",
        input: {},
      });

      // error with no message
      const errorEvent = runtime.testExtractEvent(openCodeEvent("error"));
      expect(errorEvent).toEqual({
        type: "error",
        message: "Unknown error",
      });
    });
  });

  // ── buildEnv ──────────────────────────────────────────────────────────

  describe("buildEnv", () => {
    it("returns empty record", () => {
      const env = runtime.testBuildEnv(makeParams());
      expect(env).toEqual({});
    });

    it("does not inject auth vars regardless of params", () => {
      const env = runtime.testBuildEnv(makeParams({ env: { OPENCODE_API_KEY: "test-key" } }));
      expect(env).toEqual({});
      expect(env).not.toHaveProperty("OPENCODE_API_KEY");
    });
  });

  // ── done event enrichment ─────────────────────────────────────────────

  describe("done event enrichment", () => {
    it("enriches done event with accumulated text, session ID, and usage", () => {
      // text events → accumulated text + sessionID capture
      runtime.testExtractEvent(
        openCodeEvent("text", { content: "Hello ", sessionID: "sess-enrich" }),
      );
      runtime.testExtractEvent(openCodeEvent("text", { content: "World" }));

      // step_finish → usage
      runtime.testExtractEvent(
        openCodeEvent("step_finish", {
          tokens: { input: 300, output: 200, cache: { read: 50, write: 10 } },
          cost: 0.005,
          reason: "end_turn",
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
      expect(doneEvent.result.sessionId).toBe("sess-enrich");
      expect(doneEvent.result.usage).toEqual({
        inputTokens: 300,
        outputTokens: 200,
        cacheReadTokens: 50,
        cacheWriteTokens: 10,
      });
      expect(doneEvent.result.totalCostUsd).toBe(0.005);
      expect(doneEvent.result.stopReason).toBe("end_turn");
      expect(doneEvent.result.durationMs).toBe(5000);
      expect(doneEvent.result.aborted).toBe(false);
    });

    it("includes cacheReadTokens and cacheWriteTokens when present", () => {
      runtime.testExtractEvent(
        openCodeEvent("step_finish", {
          tokens: { input: 100, output: 50, cache: { read: 30, write: 15 } },
          cost: 0.001,
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 30,
        cacheWriteTokens: 15,
      });
    });

    it("omits cache tokens when zero", () => {
      runtime.testExtractEvent(
        openCodeEvent("step_finish", {
          tokens: { input: 100, output: 50, cache: { read: 0, write: 0 } },
          cost: 0.001,
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
      expect(doneEvent.result.usage).not.toHaveProperty("cacheWriteTokens");
    });

    it("sets totalCostUsd and stopReason from step_finish", () => {
      runtime.testExtractEvent(
        openCodeEvent("step_finish", {
          tokens: { input: 100, output: 50 },
          cost: 0.0042,
          reason: "end_turn",
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.totalCostUsd).toBe(0.0042);
      expect(doneEvent.result.stopReason).toBe("end_turn");
    });

    it("handles missing step_finish gracefully (no usage, no cost)", () => {
      runtime.testExtractEvent(
        openCodeEvent("text", { content: "response", sessionID: "sess-no-finish" }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.text).toBe("response");
      expect(doneEvent.result.sessionId).toBe("sess-no-finish");
      expect(doneEvent.result.usage).toBeUndefined();
      expect(doneEvent.result.totalCostUsd).toBeUndefined();
      expect(doneEvent.result.stopReason).toBeUndefined();
    });
  });

  // ── MCP config file management ────────────────────────────────────────

  describe("OpenCodeMcpConfigManager", () => {
    let testDir: string;
    let openCodeDir: string;
    let configPath: string;

    beforeEach(async () => {
      testDir = join(
        tmpdir(),
        `opencode-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await mkdir(testDir, { recursive: true });
      openCodeDir = join(testDir, ".opencode");
      configPath = join(openCodeDir, "config.json");
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("creates JSON config file when mcpServers has entries", async () => {
      const manager = new OpenCodeMcpConfigManager(testDir, {
        myServer: { command: "node", args: ["server.js"] },
      });

      await manager.setup();

      const content = JSON.parse(await readFile(configPath, "utf-8"));
      expect(content).toEqual({
        mcpServers: {
          myServer: { command: "node", args: ["server.js"] },
        },
      });

      await manager.teardown();
    });

    it("cleans up created file on teardown", async () => {
      const manager = new OpenCodeMcpConfigManager(testDir, {
        s: { command: "cmd" },
      });

      await manager.setup();

      // File exists
      await expect(readFile(configPath, "utf-8")).resolves.toBeTruthy();

      await manager.teardown();

      // File should be removed
      await expect(readFile(configPath, "utf-8")).rejects.toThrow();
    });

    it("preserves existing config and restores on teardown", async () => {
      // Create existing config
      await mkdir(openCodeDir, { recursive: true });
      const originalConfig = { theme: "dark", otherKey: "value" };
      await writeFile(configPath, JSON.stringify(originalConfig), "utf-8");

      const manager = new OpenCodeMcpConfigManager(testDir, {
        newServer: { command: "python", args: ["serve.py"] },
      });

      await manager.setup();

      // Should have merged config
      const merged = JSON.parse(await readFile(configPath, "utf-8"));
      expect(merged.theme).toBe("dark");
      expect(merged.otherKey).toBe("value");
      expect(merged.mcpServers).toEqual({
        newServer: { command: "python", args: ["serve.py"] },
      });

      await manager.teardown();

      // Should restore original
      const restored = JSON.parse(await readFile(configPath, "utf-8"));
      expect(restored).toEqual(originalConfig);
    });

    it("writes correct JSON structure with mcpServers key", async () => {
      const manager = new OpenCodeMcpConfigManager(testDir, {
        server1: { command: "node", args: ["s1.js"] },
        server2: { command: "python", args: ["s2.py"], env: { KEY: "val" } },
      });

      await manager.setup();

      const content = JSON.parse(await readFile(configPath, "utf-8"));
      expect(content).toEqual({
        mcpServers: {
          server1: { command: "node", args: ["s1.js"] },
          server2: { command: "python", args: ["s2.py"], env: { KEY: "val" } },
        },
      });

      await manager.teardown();
    });
  });
});
