import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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
 * Codex CLI runtime — invokes `codex exec --json`
 * and maps the streaming NDJSON output to {@link AgentEvent} instances.
 *
 * The Codex CLI uses a two-level event model:
 * - Top-level events: thread.started, turn.started, item.started, item.updated,
 *   item.completed, turn.completed, turn.failed, error
 * - Item types: agent_message, command_execution, mcp_tool_call, file_change,
 *   reasoning, web_search, error, todo_list
 */
export class CodexCliRuntime extends CLIRuntimeBase {
  // ── Media capabilities ────────────────────────────────────────────────

  readonly mediaCapabilities = {
    acceptsInbound: ["image/"],
    emitsOutbound: false,
  } as const;

  // ── Per-execution state (reset before each run) ───────────────────────

  private currentSessionId: string | undefined;
  private accumulatedText = "";
  private lastEmittedTextLength = 0;
  private lastUsage: AgentUsage | undefined;
  private currentToolId: string | undefined;
  private itemCounter = 0;

  constructor() {
    super("codex");
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
        ? new CodexMcpConfigManager(params.mcpServers)
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
    const composed = this.composePrompt(params);

    if (params.sessionId) {
      // Session resume: codex exec resume --json <id> <prompt>
      // Note: --color is not supported by the resume subcommand.
      // Images are skipped on resume — Codex propagates conversation context internally.
      return ["exec", "resume", "--json", params.sessionId, composed];
    }

    // New session: codex exec --json --color never [--image ...] <prompt>
    const args = ["exec", "--json", "--color", "never"];

    // Append --image flags for each image attachment with a file path
    if (params.media) {
      for (const attachment of params.media) {
        if (attachment.mimeType.startsWith("image/") && attachment.filePath) {
          args.push("--image", attachment.filePath);
        }
      }
    }

    args.push(composed);
    return args;
  }

  protected extractEvent(line: string): AgentEvent | null {
    const parsed: unknown = JSON.parse(line);
    if (!isObject(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    switch (parsed.type) {
      case "thread.started":
        return this.handleThreadStarted(parsed);
      case "item.started":
        return this.handleItemStarted(parsed);
      case "item.updated":
        return this.handleItemUpdated(parsed);
      case "item.completed":
        return this.handleItemCompleted(parsed);
      case "turn.completed":
        return this.handleTurnCompleted(parsed);
      case "turn.failed":
        return this.handleTurnFailed(parsed);
      case "error":
        return this.handleError(parsed);
      // turn.started — skip (lifecycle boundary)
      default:
        return null;
    }
  }

  protected buildEnv(_params: AgentExecuteParams): Record<string, string> {
    return {};
  }

  // ── Event handlers ────────────────────────────────────────────────────

  private handleThreadStarted(parsed: Record<string, unknown>): null {
    if (typeof parsed.thread_id === "string") {
      this.currentSessionId = parsed.thread_id;
    }
    return null;
  }

  private handleItemStarted(parsed: Record<string, unknown>): AgentEvent | null {
    const item = isObject(parsed.item) ? parsed.item : null;
    if (!item || typeof item.type !== "string") {
      return null;
    }

    const toolId = this.extractToolId(item);

    switch (item.type) {
      case "command_execution": {
        this.currentToolId = toolId;
        const command = typeof item.command === "string" ? item.command : "";
        return {
          type: "tool_use",
          toolName: "command_execution",
          toolId,
          input: { command },
        } satisfies AgentToolUseEvent;
      }
      case "mcp_tool_call": {
        this.currentToolId = toolId;
        const toolName = typeof item.name === "string" ? item.name : "";
        const args = isObject(item.arguments) ? item.arguments : {};
        return {
          type: "tool_use",
          toolName,
          toolId,
          input: args,
        } satisfies AgentToolUseEvent;
      }
      case "agent_message":
        // Reset delta tracking for new message item
        this.lastEmittedTextLength = 0;
        return null;
      case "reasoning":
        return null;
      default:
        return null;
    }
  }

  private handleItemUpdated(parsed: Record<string, unknown>): AgentEvent | null {
    const item = isObject(parsed.item) ? parsed.item : null;
    if (!item) {
      return null;
    }

    if (item.type === "reasoning") {
      const text = this.extractReasoningText(item);
      if (text) {
        return { type: "thinking", text } satisfies AgentThinkingEvent;
      }
      return null;
    }

    if (item.type !== "agent_message") {
      return null;
    }

    const fullText = this.extractMessageText(item);
    if (fullText === undefined) {
      return null;
    }

    const delta = fullText.substring(this.lastEmittedTextLength);
    this.lastEmittedTextLength = fullText.length;

    if (delta) {
      this.accumulatedText += delta;
      return { type: "text", text: delta } satisfies AgentTextEvent;
    }

    return null;
  }

  private handleItemCompleted(parsed: Record<string, unknown>): AgentEvent | null {
    const item = isObject(parsed.item) ? parsed.item : null;
    if (!item || typeof item.type !== "string") {
      return null;
    }

    switch (item.type) {
      case "agent_message": {
        // Emit final delta if any remains
        const fullText = this.extractMessageText(item);
        if (fullText !== undefined) {
          const delta = fullText.substring(this.lastEmittedTextLength);
          this.lastEmittedTextLength = fullText.length;
          if (delta) {
            this.accumulatedText += delta;
            return { type: "text", text: delta } satisfies AgentTextEvent;
          }
        }
        return null;
      }
      case "reasoning": {
        const text = this.extractReasoningText(item);
        if (text) {
          return { type: "thinking", text } satisfies AgentThinkingEvent;
        }
        return null;
      }
      case "command_execution": {
        const toolId = this.currentToolId ?? this.extractToolId(item);
        this.currentToolId = undefined;
        const output = typeof item.output === "string" ? item.output : "";
        const exitCode = typeof item.exit_code === "number" ? item.exit_code : 0;
        return {
          type: "tool_result",
          toolId,
          output,
          isError: exitCode !== 0,
        } satisfies AgentToolResultEvent;
      }
      case "mcp_tool_call": {
        const toolId = this.currentToolId ?? this.extractToolId(item);
        this.currentToolId = undefined;
        const output = typeof item.output === "string" ? item.output : "";
        const hasError = typeof item.error === "string" && item.error.length > 0;
        return {
          type: "tool_result",
          toolId,
          output,
          isError: hasError,
        } satisfies AgentToolResultEvent;
      }
      case "error": {
        const message = typeof item.message === "string" ? item.message : "Unknown error";
        return {
          type: "error",
          message,
        } satisfies AgentErrorEvent;
      }
      default:
        return null;
    }
  }

  private handleTurnCompleted(parsed: Record<string, unknown>): null {
    if (isObject(parsed.usage)) {
      const usage = parsed.usage;
      this.lastUsage = {
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
        ...(typeof usage.cached_input_tokens === "number" && usage.cached_input_tokens > 0
          ? { cacheReadTokens: usage.cached_input_tokens }
          : {}),
      };
    }
    return null;
  }

  private handleTurnFailed(parsed: Record<string, unknown>): AgentEvent {
    const message = typeof parsed.message === "string" ? parsed.message : "Turn failed";
    return {
      type: "error",
      message,
      code: "turn_failed",
    } satisfies AgentErrorEvent;
  }

  private handleError(parsed: Record<string, unknown>): AgentEvent {
    const message = typeof parsed.message === "string" ? parsed.message : "Unknown error";
    return {
      type: "error",
      message,
    } satisfies AgentErrorEvent;
  }

  // ── Done event enrichment ─────────────────────────────────────────────

  private enrichDoneEvent(event: AgentDoneEvent): void {
    const { result } = event;

    result.text = this.accumulatedText;
    result.sessionId = this.currentSessionId;

    if (this.lastUsage) {
      result.usage = this.lastUsage;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private extractToolId(item: Record<string, unknown>): string {
    if (typeof item.id === "string") {
      return item.id;
    }
    return `codex-item-${this.itemCounter++}`;
  }

  private extractMessageText(item: Record<string, unknown>): string | undefined {
    // Codex agent_message items have a content array with text parts
    if (Array.isArray(item.content)) {
      const textParts: string[] = [];
      for (const part of item.content) {
        if (isObject(part) && part.type === "output_text" && typeof part.text === "string") {
          textParts.push(part.text);
        }
      }
      if (textParts.length > 0) {
        return textParts.join("");
      }
    }

    // Fallback: direct text field
    if (typeof item.text === "string") {
      return item.text;
    }

    return undefined;
  }

  private extractReasoningText(item: Record<string, unknown>): string | undefined {
    // Codex reasoning items carry text in a `summary` array of text parts
    if (Array.isArray(item.summary)) {
      const textParts: string[] = [];
      for (const part of item.summary) {
        if (isObject(part) && part.type === "summary_text" && typeof part.text === "string") {
          textParts.push(part.text);
        }
      }
      if (textParts.length > 0) {
        return textParts.join("");
      }
    }

    // Fallback: direct text field
    if (typeof item.text === "string") {
      return item.text;
    }

    return undefined;
  }

  // ── State reset ───────────────────────────────────────────────────────

  private resetState(): void {
    this.currentSessionId = undefined;
    this.accumulatedText = "";
    this.lastEmittedTextLength = 0;
    this.lastUsage = undefined;
    this.currentToolId = undefined;
    this.itemCounter = 0;
  }
}

// ── MCP Config Manager ────────────────────────────────────────────────────

/**
 * Manages the `~/.codex/config.toml` lifecycle for MCP server configuration.
 *
 * The Codex CLI reads MCP config from `~/.codex/config.toml`. The config uses
 * TOML format with `[mcp_servers.<name>]` sections.
 *
 * Uses a merge-restore pattern:
 * - **Setup**: read existing config (if any), save a copy, append `mcp_servers`
 *   sections, write back.
 * - **Teardown** (always, via `finally`): restore original or delete created file.
 */
export class CodexMcpConfigManager {
  private readonly configDir: string;
  private readonly configPath: string;

  private originalContent: string | null = null;
  private createdFile = false;
  private createdDir = false;

  constructor(
    private readonly mcpServers: Record<string, McpServerConfig>,
    configDir?: string,
  ) {
    this.configDir = configDir ?? join(homedir(), ".codex");
    this.configPath = join(this.configDir, "config.toml");
  }

  async setup(): Promise<void> {
    // Ensure ~/.codex/ directory exists
    try {
      await mkdir(this.configDir, { recursive: true });
    } catch {
      // Directory already exists or cannot be created
    }

    // Check for existing config file
    let existingContent: string | null = null;
    try {
      const content = await readFile(this.configPath, "utf-8");
      this.originalContent = content;
      existingContent = content;
    } catch {
      // File doesn't exist — we'll create a new one
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

    // Build merged config: preserve existing content + append MCP sections
    const mcpToml = serializeMcpServersToToml(this.mcpServers);

    if (existingContent) {
      // Strip any existing [mcp_servers.*] sections to avoid duplication,
      // then append our sections
      const stripped = stripMcpServersSections(existingContent);
      const separator = stripped.endsWith("\n") ? "\n" : "\n\n";
      await writeFile(this.configPath, stripped + separator + mcpToml, "utf-8");
    } else {
      await writeFile(this.configPath, mcpToml, "utf-8");
    }
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

// ── TOML Serialization ──────────────────────────────────────────────────

/**
 * Serialize MCP server configs to TOML format for Codex config.
 *
 * Output format:
 * ```toml
 * [mcp_servers.server_name]
 * type = "stdio"
 * command = "node"
 * args = ["server.js"]
 *
 * [mcp_servers.server_name.env]
 * KEY = "VALUE"
 * ```
 */
export function serializeMcpServersToToml(mcpServers: Record<string, McpServerConfig>): string {
  const sections: string[] = [];

  for (const [name, config] of Object.entries(mcpServers)) {
    const lines: string[] = [];
    lines.push(`[mcp_servers.${name}]`);
    lines.push(`type = "stdio"`);

    // command is a string; args is a separate array
    lines.push(`command = ${toTomlString(config.command)}`);
    const args = config.args ?? [];
    if (args.length > 0) {
      lines.push(`args = [${args.map((s) => toTomlString(s)).join(", ")}]`);
    }

    sections.push(lines.join("\n"));

    // Environment variables as a sub-table
    if (config.env && Object.keys(config.env).length > 0) {
      const envLines: string[] = [];
      envLines.push(`[mcp_servers.${name}.env]`);
      for (const [key, value] of Object.entries(config.env)) {
        envLines.push(`${key} = ${toTomlString(value)}`);
      }
      sections.push(envLines.join("\n"));
    }
  }

  return sections.join("\n\n") + "\n";
}

/**
 * Strip existing `[mcp_servers.*]` sections from TOML content.
 * This is a simple line-based approach that removes lines belonging to
 * mcp_servers sections (from header to next non-mcp_servers section).
 */
function stripMcpServersSections(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inMcpSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this is a section header
    if (trimmed.startsWith("[")) {
      if (trimmed.startsWith("[mcp_servers.") || trimmed === "[mcp_servers]") {
        inMcpSection = true;
        continue;
      }
      inMcpSection = false;
    }

    if (!inMcpSection) {
      result.push(line);
    }
  }

  // Remove trailing blank lines
  while (result.length > 0 && result[result.length - 1].trim() === "") {
    result.pop();
  }

  return result.join("\n") + "\n";
}

/** Escape a string for TOML (basic string with double quotes). */
function toTomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
