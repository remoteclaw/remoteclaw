import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLIRuntimeBase } from "../cli-runtime-base.js";
import type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentEvent,
  AgentExecuteParams,
  AgentTextEvent,
  AgentThinkingEvent,
  AgentToolResultEvent,
  AgentToolUseEvent,
  AgentUsage,
  McpServerConfig,
} from "../types.js";

/**
 * OpenCode CLI runtime — invokes `opencode run --format json`
 * and maps the streaming NDJSON output to {@link AgentEvent} instances.
 *
 * OpenCode uses a per-line envelope model where every NDJSON line has:
 * `{ type, timestamp, sessionID, ...data }`
 *
 * Key differences from other runtimes:
 * - Text events are complete parts (no delta tracking needed)
 * - Tool events combine use + result in a single line (buffered drain pattern)
 * - Usage/cost comes from `step_finish` events
 */
export class OpenCodeCliRuntime extends CLIRuntimeBase {
  // ── Media capabilities ────────────────────────────────────────────────

  readonly mediaCapabilities = {
    acceptsInbound: [] as string[],
    emitsOutbound: false,
  };

  // ── Per-execution state (reset before each run) ───────────────────────

  private currentSessionId: string | undefined;
  private accumulatedText = "";
  private lastStepFinish: StepFinishData | undefined;
  private pendingEvents: AgentEvent[] = [];
  private toolCounter = 0;

  constructor() {
    super("opencode");
  }

  // ── execute() override: state reset + MCP config + pending drain + done enrichment ──

  async *execute(params: AgentExecuteParams): AsyncIterable<AgentEvent> {
    this.resetState();

    const mcpConfigManager =
      params.mcpServers && Object.keys(params.mcpServers).length > 0
        ? new OpenCodeMcpConfigManager(params.workingDirectory, params.mcpServers)
        : null;

    try {
      await mcpConfigManager?.setup();

      for await (const event of super.execute(params)) {
        if (event.type === "done") {
          this.enrichDoneEvent(event);
        }
        yield event;

        // Drain buffered events (from tool_use → tool_result pairs)
        while (this.pendingEvents.length > 0) {
          yield this.pendingEvents.shift()!;
        }
      }
    } finally {
      await mcpConfigManager?.teardown();
    }
  }

  // ── CLIRuntimeBase abstract method implementations ────────────────────

  protected buildArgs(params: AgentExecuteParams): string[] {
    const args: string[] = ["run", "--format", "json"];

    if (params.sessionId) {
      args.push("--session", params.sessionId);
    }

    args.push(params.prompt);
    return args;
  }

  protected extractEvent(line: string): AgentEvent | null {
    const parsed: unknown = JSON.parse(line);
    if (!isObject(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    // Extract sessionID from envelope (every event carries it)
    if (typeof parsed.sessionID === "string" && this.currentSessionId === undefined) {
      this.currentSessionId = parsed.sessionID;
    }

    // OpenCode wraps event data in a `part` field; unwrap for handlers.
    const data = isObject(parsed.part) ? parsed.part : parsed;

    switch (parsed.type) {
      case "text":
        return this.handleText(data);
      case "tool_use":
        return this.handleToolUse(data);
      case "step_start":
        return null;
      case "step_finish":
        return this.handleStepFinish(data);
      case "reasoning":
        return this.handleReasoning(data);
      case "error":
        return this.handleError(data);
      default:
        return null;
    }
  }

  protected buildEnv(_params: AgentExecuteParams): Record<string, string> {
    return {};
  }

  // ── Event handlers ────────────────────────────────────────────────────

  private handleText(parsed: Record<string, unknown>): AgentEvent | null {
    // Text is in `text` field (from `part.text`) or legacy `content` field.
    const content =
      typeof parsed.text === "string"
        ? parsed.text
        : typeof parsed.content === "string"
          ? parsed.content
          : "";
    this.accumulatedText += content;
    return { type: "text", text: content } satisfies AgentTextEvent;
  }

  private handleToolUse(parsed: Record<string, unknown>): AgentEvent | null {
    const toolId =
      typeof parsed.callID === "string" ? parsed.callID : `opencode-tool-${this.toolCounter++}`;

    // Buffer the tool_result event for drain after yield
    const state = isObject(parsed.state) ? parsed.state : undefined;
    this.pendingEvents.push({
      type: "tool_result",
      toolId,
      output: typeof state?.output === "string" ? state.output : "",
      isError: typeof state?.error === "string" && state.error.length > 0,
    } satisfies AgentToolResultEvent);

    return {
      type: "tool_use",
      toolName: typeof parsed.name === "string" ? parsed.name : "",
      toolId,
      input: isObject(parsed.input) ? parsed.input : {},
    } satisfies AgentToolUseEvent;
  }

  private handleStepFinish(parsed: Record<string, unknown>): null {
    this.lastStepFinish = {
      tokens: isObject(parsed.tokens) ? (parsed.tokens as StepFinishData["tokens"]) : undefined,
      cost: typeof parsed.cost === "number" ? parsed.cost : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
    return null;
  }

  private handleError(parsed: Record<string, unknown>): AgentEvent {
    return {
      type: "error",
      message: typeof parsed.message === "string" ? parsed.message : "Unknown error",
    } satisfies AgentErrorEvent;
  }

  private handleReasoning(parsed: Record<string, unknown>): AgentEvent | null {
    const content =
      typeof parsed.text === "string"
        ? parsed.text
        : typeof parsed.content === "string"
          ? parsed.content
          : "";
    if (!content) {
      return null;
    }
    return { type: "thinking", text: content } satisfies AgentThinkingEvent;
  }

  // ── Done event enrichment ─────────────────────────────────────────────

  private enrichDoneEvent(event: AgentDoneEvent): void {
    const { result } = event;

    result.text = this.accumulatedText;
    result.sessionId = this.currentSessionId;

    if (this.lastStepFinish) {
      const { tokens, cost, reason } = this.lastStepFinish;

      if (tokens) {
        const input = typeof tokens.input === "number" ? tokens.input : 0;
        const output = typeof tokens.output === "number" ? tokens.output : 0;
        const cache = isObject(tokens.cache) ? tokens.cache : undefined;
        const cacheRead = typeof cache?.read === "number" ? cache.read : 0;
        const cacheWrite = typeof cache?.write === "number" ? cache.write : 0;

        const usage: AgentUsage = {
          inputTokens: input,
          outputTokens: output,
          ...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
          ...(cacheWrite > 0 ? { cacheWriteTokens: cacheWrite } : {}),
        };
        result.usage = usage;
      }

      if (cost !== undefined) {
        result.totalCostUsd = cost;
      }
      if (reason !== undefined) {
        result.stopReason = reason;
      }
    }
  }

  // ── State reset ───────────────────────────────────────────────────────

  private resetState(): void {
    this.currentSessionId = undefined;
    this.accumulatedText = "";
    this.lastStepFinish = undefined;
    this.pendingEvents = [];
    this.toolCounter = 0;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

type StepFinishData = {
  tokens:
    | {
        input?: number;
        output?: number;
        reasoning?: number;
        total?: number;
        cache?: { read?: number; write?: number };
      }
    | undefined;
  cost: number | undefined;
  reason: string | undefined;
};

// ── MCP Config Manager ────────────────────────────────────────────────────

/**
 * Manages the `.opencode/config.json` lifecycle for MCP server configuration.
 *
 * OpenCode reads MCP config from its project-level settings file. Uses a
 * merge-restore pattern (same as Gemini and Codex):
 *
 * - **Setup**: read existing `.opencode/config.json` (if any), save a copy,
 *   merge `mcpServers` into it, write back.
 * - **Teardown** (always, via `finally`): restore the original file, or remove
 *   the file/directory we created.
 */
export class OpenCodeMcpConfigManager {
  private readonly configDir: string;
  private readonly configPath: string;

  private originalContent: string | null = null;
  private createdFile = false;
  private createdDir = false;

  constructor(
    workingDirectory: string | undefined,
    private readonly mcpServers: Record<string, McpServerConfig>,
  ) {
    const baseDir = workingDirectory ?? process.cwd();
    this.configDir = join(baseDir, ".opencode");
    this.configPath = join(this.configDir, "config.json");
  }

  async setup(): Promise<void> {
    // Ensure .opencode/ directory exists
    try {
      await mkdir(this.configDir, { recursive: true });
    } catch {
      // Directory already exists or cannot be created
    }

    // Check for existing config file
    let existingConfig: Record<string, unknown> | null = null;
    try {
      const content = await readFile(this.configPath, "utf-8");
      this.originalContent = content;
      existingConfig = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // File doesn't exist or is invalid — we'll create a new one
      this.createdFile = true;

      // Check if we created the directory
      try {
        const entries = await readdir(this.configDir);
        if (entries.length === 0) {
          this.createdDir = true;
        }
      } catch {
        // Ignore
      }
    }

    // Build merged config
    const mergedConfig: Record<string, unknown> = existingConfig ?? {};
    mergedConfig.mcpServers = this.mcpServers;

    await writeFile(this.configPath, JSON.stringify(mergedConfig, null, 2), "utf-8");
  }

  async teardown(): Promise<void> {
    try {
      if (this.originalContent !== null) {
        // Restore original file
        await writeFile(this.configPath, this.originalContent, "utf-8");
      } else if (this.createdFile) {
        // Remove file we created
        await rm(this.configPath, { force: true });

        // Remove directory if we created it
        if (this.createdDir) {
          try {
            await rmdir(this.configDir);
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
