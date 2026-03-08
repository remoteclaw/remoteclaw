import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLIRuntimeBase } from "../cli-runtime-base.js";
import type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentEvent,
  AgentExecuteParams,
  AgentTextEvent,
  AgentToolResultEvent,
  AgentToolUseEvent,
  AgentUsage,
  McpServerConfig,
} from "../types.js";

/**
 * Gemini CLI runtime — invokes `gemini --output-format stream-json`
 * and maps the streaming NDJSON output to {@link AgentEvent} instances.
 */
export class GeminiCliRuntime extends CLIRuntimeBase {
  // ── Media capabilities ────────────────────────────────────────────────

  readonly mediaCapabilities = {
    acceptsInbound: ["image/", "audio/", "video/"],
    emitsOutbound: false,
  } as const;

  // ── Per-execution state (reset before each run) ───────────────────────

  private currentSessionId: string | undefined;
  private accumulatedText = "";
  private resultStats: GeminiResultStats | undefined;

  constructor() {
    super("gemini");
  }

  // ── stdin prompt delivery override ────────────────────────────────────

  protected override get supportsStdinPrompt(): boolean {
    return false;
  }

  // ── execute() override: state reset + MCP config + done enrichment ────

  async *execute(params: AgentExecuteParams): AsyncIterable<AgentEvent> {
    this.resetState();

    const mcpConfigManager =
      params.mcpServers && Object.keys(params.mcpServers).length > 0
        ? new GeminiMcpConfigManager(params.workingDirectory, params.mcpServers)
        : null;

    try {
      await mcpConfigManager?.setup();

      for await (const event of super.execute(params)) {
        if (event.type === "done") {
          this.enrichDoneEvent(event);
        }
        yield event;
      }
    } finally {
      await mcpConfigManager?.teardown();
    }
  }

  // ── CLIRuntimeBase abstract method implementations ────────────────────

  protected buildArgs(params: AgentExecuteParams): string[] {
    const args: string[] = ["--output-format", "stream-json", "--prompt", params.prompt];

    if (params.sessionId) {
      args.push("--resume", params.sessionId);
    }

    return args;
  }

  protected extractEvent(line: string): AgentEvent | null {
    const parsed: unknown = JSON.parse(line);
    if (!isObject(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    switch (parsed.type) {
      case "init":
        return this.handleInit(parsed);
      case "message":
        return this.handleMessage(parsed);
      case "tool_use":
        return this.handleToolUse(parsed);
      case "tool_result":
        return this.handleToolResult(parsed);
      case "error":
        return this.handleError(parsed);
      case "result":
        return this.handleResult(parsed);
      default:
        return null;
    }
  }

  protected buildEnv(_params: AgentExecuteParams): Record<string, string> {
    return {};
  }

  // ── Event handlers ────────────────────────────────────────────────────

  private handleInit(parsed: Record<string, unknown>): null {
    if (typeof parsed.session_id === "string") {
      this.currentSessionId = parsed.session_id;
    }
    return null;
  }

  private handleMessage(parsed: Record<string, unknown>): AgentEvent | null {
    if (parsed.delta !== true || parsed.role !== "assistant") {
      return null;
    }

    const content = typeof parsed.content === "string" ? parsed.content : undefined;
    if (content === undefined) {
      return null;
    }

    this.accumulatedText += content;
    return { type: "text", text: content } satisfies AgentTextEvent;
  }

  private handleToolUse(parsed: Record<string, unknown>): AgentEvent | null {
    return {
      type: "tool_use",
      toolName: typeof parsed.tool_name === "string" ? parsed.tool_name : "",
      toolId: typeof parsed.tool_id === "string" ? parsed.tool_id : "",
      input: isObject(parsed.parameters) ? parsed.parameters : {},
    } satisfies AgentToolUseEvent;
  }

  private handleToolResult(parsed: Record<string, unknown>): AgentEvent | null {
    return {
      type: "tool_result",
      toolId: typeof parsed.tool_id === "string" ? parsed.tool_id : "",
      output: typeof parsed.output === "string" ? parsed.output : "",
      isError: parsed.status === "error",
    } satisfies AgentToolResultEvent;
  }

  private handleError(parsed: Record<string, unknown>): AgentEvent | null {
    return {
      type: "error",
      message: typeof parsed.message === "string" ? parsed.message : "Unknown error",
      code: typeof parsed.severity === "string" ? parsed.severity : undefined,
    } satisfies AgentErrorEvent;
  }

  private handleResult(parsed: Record<string, unknown>): null {
    if (isObject(parsed.stats)) {
      this.resultStats = {
        inputTokens:
          typeof parsed.stats.input_tokens === "number" ? parsed.stats.input_tokens : undefined,
        outputTokens:
          typeof parsed.stats.output_tokens === "number" ? parsed.stats.output_tokens : undefined,
        cached: typeof parsed.stats.cached === "number" ? parsed.stats.cached : undefined,
        durationMs:
          typeof parsed.stats.duration_ms === "number" ? parsed.stats.duration_ms : undefined,
        toolCalls:
          typeof parsed.stats.tool_calls === "number" ? parsed.stats.tool_calls : undefined,
      };
    }
    return null;
  }

  // ── Done event enrichment ─────────────────────────────────────────────

  private enrichDoneEvent(event: AgentDoneEvent): void {
    const { result } = event;

    result.text = this.accumulatedText;
    result.sessionId = this.currentSessionId;

    if (this.resultStats) {
      const usage: AgentUsage = {
        inputTokens: this.resultStats.inputTokens ?? 0,
        outputTokens: this.resultStats.outputTokens ?? 0,
        ...(this.resultStats.cached != null && this.resultStats.cached > 0
          ? { cacheReadTokens: this.resultStats.cached }
          : {}),
      };
      result.usage = usage;

      if (this.resultStats.durationMs !== undefined) {
        result.apiDurationMs = this.resultStats.durationMs;
      }
      if (this.resultStats.toolCalls !== undefined) {
        result.numTurns = this.resultStats.toolCalls;
      }
    }
  }

  // ── State reset ───────────────────────────────────────────────────────

  private resetState(): void {
    this.currentSessionId = undefined;
    this.accumulatedText = "";
    this.resultStats = undefined;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

type GeminiResultStats = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  cached: number | undefined;
  durationMs: number | undefined;
  toolCalls: number | undefined;
};

// ── MCP Config Manager ────────────────────────────────────────────────────

/**
 * Manages the `.gemini/settings.json` lifecycle for MCP server configuration.
 *
 * The Gemini CLI reads MCP config from a fixed settings file hierarchy — there
 * is no `--mcp-config`, `--settings-dir`, or `--config` CLI flag. Project-level
 * settings live in `.gemini/settings.json` within the working directory.
 *
 * A `GEMINI_CONFIG_DIR` env var was requested (google-gemini/gemini-cli#2815)
 * but redirected to XDG spec compliance (#1825), which hasn't shipped as of
 * v0.11.x. Until a flag or env var exists, we use a merge-restore pattern:
 *
 * - **Setup**: read existing `.gemini/settings.json` (if any), save a copy,
 *   merge `mcpServers` into it, write back.
 * - **Teardown** (always, via `finally`): restore the original file, or remove
 *   the file/directory we created.
 */
export class GeminiMcpConfigManager {
  private readonly settingsDir: string;
  private readonly settingsPath: string;

  private originalContent: string | null = null;
  private createdFile = false;
  private createdDir = false;

  constructor(
    workingDirectory: string | undefined,
    private readonly mcpServers: Record<string, McpServerConfig>,
  ) {
    const baseDir = workingDirectory ?? process.cwd();
    this.settingsDir = join(baseDir, ".gemini");
    this.settingsPath = join(this.settingsDir, "settings.json");
  }

  async setup(): Promise<void> {
    // Ensure .gemini/ directory exists
    try {
      await mkdir(this.settingsDir, { recursive: true });
    } catch {
      // Directory already exists or cannot be created
    }

    // Check for existing settings file
    let existingSettings: Record<string, unknown> | null = null;
    try {
      const content = await readFile(this.settingsPath, "utf-8");
      this.originalContent = content;
      existingSettings = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // File doesn't exist or is invalid — we'll create a new one
      this.createdFile = true;

      // Check if we created the directory
      try {
        const entries = await readdir(this.settingsDir);
        if (entries.length === 0) {
          this.createdDir = true;
        }
      } catch {
        // Ignore
      }
    }

    // Build merged settings
    const mergedSettings: Record<string, unknown> = existingSettings ?? {};
    mergedSettings.mcpServers = this.mcpServers;

    await writeFile(this.settingsPath, JSON.stringify(mergedSettings, null, 2), "utf-8");
  }

  async teardown(): Promise<void> {
    try {
      if (this.originalContent !== null) {
        // Restore original file
        await writeFile(this.settingsPath, this.originalContent, "utf-8");
      } else if (this.createdFile) {
        // Remove file we created
        await rm(this.settingsPath, { force: true });

        // Remove directory if we created it
        if (this.createdDir) {
          try {
            await rmdir(this.settingsDir);
          } catch {
            // Directory not empty or already removed — ignore
          }
        }
      }
    } catch {
      // Best-effort cleanup — don't throw during teardown
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
