import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentDoneEvent, AgentEvent, AgentExecuteParams, AgentRunResult } from "../types.js";
import { GeminiCliRuntime, GeminiMcpConfigManager } from "./gemini.js";

// ── Test helper: expose protected methods ───────────────────────────────

class TestableGeminiCliRuntime extends GeminiCliRuntime {
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
    prompt: "Hello, Gemini!",
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

function geminiEvent(type: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type,
    timestamp: "2026-01-15T10:00:00Z",
    ...fields,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("GeminiCliRuntime", () => {
  let runtime: TestableGeminiCliRuntime;

  beforeEach(() => {
    runtime = new TestableGeminiCliRuntime();
  });

  // ── supportsStdinPrompt ─────────────────────────────────────────────

  describe("supportsStdinPrompt", () => {
    it("returns false", () => {
      expect(runtime.testSupportsStdinPrompt).toBe(false);
    });
  });

  // ── buildArgs ─────────────────────────────────────────────────────────

  describe("buildArgs", () => {
    it("produces base flags with prompt via --prompt flag", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).toEqual(["--output-format", "stream-json", "--prompt", "Hello, Gemini!"]);
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

    it("delivers prompt via --prompt flag, not positional", () => {
      const args = runtime.testBuildArgs(makeParams({ prompt: "test prompt" }));
      const pIdx = args.indexOf("--prompt");
      expect(pIdx).toBeGreaterThan(-1);
      expect(args[pIdx + 1]).toBe("test prompt");
    });

    it("combines all flags: session + prompt", () => {
      const args = runtime.testBuildArgs(
        makeParams({
          sessionId: "sess-456",
        }),
      );

      expect(args).toContain("--output-format");
      expect(args).toContain("stream-json");
      expect(args).toContain("--prompt");
      expect(args).toContain("Hello, Gemini!");
      expect(args).toContain("--resume");
      expect(args).toContain("sess-456");
    });

    it("does not include --verbose flag", () => {
      const args = runtime.testBuildArgs(makeParams());
      expect(args).not.toContain("--verbose");
    });

    it("does not include --mcp-config flag (MCP handled via settings file)", () => {
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
    it("captures session_id from init event and returns null", () => {
      const event = runtime.testExtractEvent(geminiEvent("init", { session_id: "gemini-sess-1" }));
      expect(event).toBeNull();
    });

    it("maps assistant delta message to AgentTextEvent", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("message", {
          delta: true,
          role: "assistant",
          content: "Hello there!",
        }),
      );
      expect(event).toEqual({ type: "text", text: "Hello there!" });
    });

    it("skips non-delta message (final echo)", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("message", {
          delta: false,
          role: "assistant",
          content: "Full response",
        }),
      );
      expect(event).toBeNull();
    });

    it("skips user role message", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("message", {
          delta: true,
          role: "user",
          content: "User message",
        }),
      );
      expect(event).toBeNull();
    });

    it("maps tool_use to AgentToolUseEvent", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("tool_use", {
          tool_name: "read_file",
          tool_id: "tool-1",
          parameters: { path: "/tmp/foo.txt" },
        }),
      );
      expect(event).toEqual({
        type: "tool_use",
        toolName: "read_file",
        toolId: "tool-1",
        input: { path: "/tmp/foo.txt" },
      });
    });

    it("maps tool_result with success status to AgentToolResultEvent", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("tool_result", {
          tool_id: "tool-1",
          output: "file contents here",
          status: "success",
        }),
      );
      expect(event).toEqual({
        type: "tool_result",
        toolId: "tool-1",
        output: "file contents here",
        isError: false,
      });
    });

    it("maps tool_result with error status to AgentToolResultEvent with isError", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("tool_result", {
          tool_id: "tool-2",
          output: "File not found",
          status: "error",
        }),
      );
      expect(event).toEqual({
        type: "tool_result",
        toolId: "tool-2",
        output: "File not found",
        isError: true,
      });
    });

    it("maps error to AgentErrorEvent with message and severity as code", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("error", {
          message: "Rate limit exceeded",
          severity: "fatal",
        }),
      );
      expect(event).toEqual({
        type: "error",
        message: "Rate limit exceeded",
        code: "fatal",
      });
    });

    it("stores result stats and returns null", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("result", {
          stats: {
            total_tokens: 500,
            input_tokens: 300,
            output_tokens: 200,
            cached: 50,
            duration_ms: 1500,
            tool_calls: 3,
          },
        }),
      );
      expect(event).toBeNull();
    });

    it("skips unknown event types", () => {
      const event = runtime.testExtractEvent(geminiEvent("unknown_type", { data: "foo" }));
      expect(event).toBeNull();
    });

    it("accumulates text across multiple message deltas", () => {
      runtime.testExtractEvent(
        geminiEvent("message", { delta: true, role: "assistant", content: "Hello " }),
      );
      runtime.testExtractEvent(
        geminiEvent("message", { delta: true, role: "assistant", content: "World" }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );
      expect(doneEvent.result.text).toBe("Hello World");
    });

    it("skips message with missing content", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("message", { delta: true, role: "assistant" }),
      );
      expect(event).toBeNull();
    });

    it("handles tool_use with empty parameters", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("tool_use", {
          tool_name: "list_files",
          tool_id: "tool-3",
        }),
      );
      expect(event).toEqual({
        type: "tool_use",
        toolName: "list_files",
        toolId: "tool-3",
        input: {},
      });
    });

    it("handles error without severity", () => {
      const event = runtime.testExtractEvent(
        geminiEvent("error", { message: "Something went wrong" }),
      );
      expect(event).toEqual({
        type: "error",
        message: "Something went wrong",
        code: undefined,
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
      const env = runtime.testBuildEnv(makeParams({ env: { GEMINI_API_KEY: "test-key" } }));
      expect(env).toEqual({});
      expect(env).not.toHaveProperty("GEMINI_API_KEY");
    });
  });

  // ── done event enrichment ─────────────────────────────────────────────

  describe("done event enrichment", () => {
    it("enriches done event with accumulated text, session ID, and usage from stats", () => {
      // init → session ID
      runtime.testExtractEvent(geminiEvent("init", { session_id: "sess-enrich" }));

      // message deltas → accumulated text
      runtime.testExtractEvent(
        geminiEvent("message", { delta: true, role: "assistant", content: "Hello " }),
      );
      runtime.testExtractEvent(
        geminiEvent("message", { delta: true, role: "assistant", content: "World" }),
      );

      // result → stats
      runtime.testExtractEvent(
        geminiEvent("result", {
          stats: {
            total_tokens: 500,
            input_tokens: 300,
            output_tokens: 200,
            cached: 50,
            duration_ms: 2000,
            tool_calls: 4,
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
      expect(doneEvent.result.sessionId).toBe("sess-enrich");
      expect(doneEvent.result.usage).toEqual({
        inputTokens: 300,
        outputTokens: 200,
        cacheReadTokens: 50,
      });
      expect(doneEvent.result.apiDurationMs).toBe(2000);
      expect(doneEvent.result.numTurns).toBe(4);
      expect(doneEvent.result.durationMs).toBe(5000);
      expect(doneEvent.result.aborted).toBe(false);
    });

    it("maps duration_ms to apiDurationMs and tool_calls to numTurns", () => {
      runtime.testExtractEvent(
        geminiEvent("result", {
          stats: {
            input_tokens: 100,
            output_tokens: 50,
            cached: 0,
            duration_ms: 1234,
            tool_calls: 7,
          },
        }),
      );

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.apiDurationMs).toBe(1234);
      expect(doneEvent.result.numTurns).toBe(7);
    });

    it("handles missing stats gracefully", () => {
      runtime.testExtractEvent(geminiEvent("init", { session_id: "sess-no-stats" }));

      runtime.testExtractEvent(
        geminiEvent("message", { delta: true, role: "assistant", content: "response" }),
      );

      // result without stats
      runtime.testExtractEvent(geminiEvent("result", {}));

      const doneEvent: AgentDoneEvent = { type: "done", result: makeDoneResult() };
      (runtime as unknown as { enrichDoneEvent: (e: AgentDoneEvent) => void }).enrichDoneEvent(
        doneEvent,
      );

      expect(doneEvent.result.text).toBe("response");
      expect(doneEvent.result.sessionId).toBe("sess-no-stats");
      expect(doneEvent.result.usage).toBeUndefined();
      expect(doneEvent.result.apiDurationMs).toBeUndefined();
      expect(doneEvent.result.numTurns).toBeUndefined();
    });

    it("does not include cacheReadTokens when cached is 0", () => {
      runtime.testExtractEvent(
        geminiEvent("result", {
          stats: {
            input_tokens: 100,
            output_tokens: 50,
            cached: 0,
            duration_ms: 500,
            tool_calls: 1,
          },
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

  // ── MCP config file management ────────────────────────────────────────

  describe("GeminiMcpConfigManager", () => {
    let testDir: string;
    let geminiDir: string;
    let settingsPath: string;

    beforeEach(async () => {
      testDir = join(
        tmpdir(),
        `gemini-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await mkdir(testDir, { recursive: true });
      geminiDir = join(testDir, ".gemini");
      settingsPath = join(geminiDir, "settings.json");
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("creates settings file when mcpServers has entries", async () => {
      const manager = new GeminiMcpConfigManager(testDir, {
        myServer: { command: "node", args: ["server.js"] },
      });

      await manager.setup();

      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(content).toEqual({
        mcpServers: {
          myServer: { command: "node", args: ["server.js"] },
        },
      });

      await manager.teardown();
    });

    it("cleans up created file and directory on teardown", async () => {
      const manager = new GeminiMcpConfigManager(testDir, {
        s: { command: "cmd" },
      });

      await manager.setup();

      // File exists
      await expect(readFile(settingsPath, "utf-8")).resolves.toBeTruthy();

      await manager.teardown();

      // File should be removed
      await expect(readFile(settingsPath, "utf-8")).rejects.toThrow();
    });

    it("merges mcpServers into existing settings and restores on teardown", async () => {
      // Create existing settings
      await mkdir(geminiDir, { recursive: true });
      const originalSettings = { theme: "dark", otherKey: "value" };
      await writeFile(settingsPath, JSON.stringify(originalSettings), "utf-8");

      const manager = new GeminiMcpConfigManager(testDir, {
        newServer: { command: "python", args: ["serve.py"] },
      });

      await manager.setup();

      // Should have merged settings
      const merged = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(merged.theme).toBe("dark");
      expect(merged.otherKey).toBe("value");
      expect(merged.mcpServers).toEqual({
        newServer: { command: "python", args: ["serve.py"] },
      });

      await manager.teardown();

      // Should restore original
      const restored = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(restored).toEqual(originalSettings);
    });

    it("writes correct JSON structure with multiple servers", async () => {
      const manager = new GeminiMcpConfigManager(testDir, {
        server1: { command: "node", args: ["s1.js"] },
        server2: { command: "python", args: ["s2.py"], env: { KEY: "val" } },
      });

      await manager.setup();

      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
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
