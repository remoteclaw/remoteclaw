import { CLIRuntimeBase } from "../cli-runtime-base.js";
import type {
  AgentDoneEvent,
  AgentEvent,
  AgentExecuteParams,
  AgentTextEvent,
  AgentToolUseEvent,
  AgentUsage,
} from "../types.js";

/**
 * Claude CLI runtime — invokes `claude --print --output-format stream-json`
 * and maps the streaming NDJSON output to {@link AgentEvent} instances.
 */
export class ClaudeCliRuntime extends CLIRuntimeBase {
  // ── Per-execution state (reset before each run) ───────────────────────

  private currentSessionId: string | undefined;
  private accumulatedText = "";
  private toolBuffer: { name: string; id: string; input: string } | null = null;
  private lastUsage: AgentUsage | undefined;
  private lastStopReason: string | undefined;
  private resultData: ResultLineData | undefined;

  constructor() {
    super("claude");
  }

  // ── execute() override: state reset + done event enrichment ────────────

  async *execute(params: AgentExecuteParams): AsyncIterable<AgentEvent> {
    this.resetState();
    for await (const event of super.execute(params)) {
      if (event.type === "done") {
        this.enrichDoneEvent(event);
      }
      yield event;
    }
  }

  // ── CLIRuntimeBase overrides ──────────────────────────────────────────

  protected buildArgs(params: AgentExecuteParams): string[] {
    const args: string[] = [
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
    ];

    if (params.sessionId) {
      args.push("--resume", params.sessionId);
    }

    if (params.mcpServers && Object.keys(params.mcpServers).length > 0) {
      args.push("--mcp-config", JSON.stringify({ mcpServers: params.mcpServers }));
    }

    // --print <prompt> comes last so it doesn't interfere with other flags.
    args.push("--print", params.prompt);

    return args;
  }

  protected extractEvent(line: string): AgentEvent | null {
    const parsed: unknown = JSON.parse(line);
    if (!isObject(parsed)) {
      return null;
    }

    // system init event — capture session_id
    if (parsed.type === "system") {
      if (typeof parsed.session_id === "string" && !this.currentSessionId) {
        this.currentSessionId = parsed.session_id;
      }
      return null;
    }

    if (parsed.type === "stream_event") {
      if (typeof parsed.session_id === "string" && !this.currentSessionId) {
        this.currentSessionId = parsed.session_id;
      }
      if (isObject(parsed.event)) {
        return this.handleInnerEvent(parsed.event);
      }
      return null;
    }

    if (parsed.type === "result") {
      this.storeResultData(parsed);
      if (parsed.is_error === true && typeof parsed.result === "string" && parsed.result) {
        return { type: "error", message: parsed.result, code: "CLI_ERROR" };
      }
      return null;
    }

    // assistant, rate_limit_event, and other types are skipped
    // (text and tool data come via stream_event when --include-partial-messages is set)
    return null;
  }

  protected buildEnv(_params: AgentExecuteParams): Record<string, string> {
    return {};
  }

  // ── Inner event handling ──────────────────────────────────────────────

  private handleInnerEvent(event: Record<string, unknown>): AgentEvent | null {
    switch (event.type) {
      case "content_block_start":
        return this.handleContentBlockStart(event);
      case "content_block_delta":
        return this.handleContentBlockDelta(event);
      case "content_block_stop":
        return this.handleContentBlockStop();
      case "message_delta":
        this.handleMessageDelta(event);
        return null;
      // message_start, message_stop, ping, and unknown types are skipped
      default:
        return null;
    }
  }

  private handleContentBlockStart(event: Record<string, unknown>): AgentEvent | null {
    const contentBlock = isObject(event.content_block) ? event.content_block : null;
    if (!contentBlock) {
      return null;
    }

    if (contentBlock.type === "tool_use") {
      this.toolBuffer = {
        name: typeof contentBlock.name === "string" ? contentBlock.name : "",
        id: typeof contentBlock.id === "string" ? contentBlock.id : "",
        input: "",
      };
    }

    return null;
  }

  private handleContentBlockDelta(event: Record<string, unknown>): AgentEvent | null {
    const delta = isObject(event.delta) ? event.delta : null;
    if (!delta) {
      return null;
    }

    if (delta.type === "text_delta" && typeof delta.text === "string") {
      this.accumulatedText += delta.text;
      return { type: "text", text: delta.text } satisfies AgentTextEvent;
    }

    if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
      if (this.toolBuffer) {
        this.toolBuffer.input += delta.partial_json;
      }
      return null;
    }

    // thinking_delta and other delta types are skipped
    return null;
  }

  private handleContentBlockStop(): AgentEvent | null {
    if (this.toolBuffer) {
      const { name, id, input } = this.toolBuffer;
      this.toolBuffer = null;

      let parsedInput: Record<string, unknown> = {};
      if (input) {
        try {
          parsedInput = JSON.parse(input) as Record<string, unknown>;
        } catch {
          // Malformed tool input — emit with empty object
        }
      }

      return {
        type: "tool_use",
        toolName: name,
        toolId: id,
        input: parsedInput,
      } satisfies AgentToolUseEvent;
    }

    return null;
  }

  private handleMessageDelta(event: Record<string, unknown>): void {
    const delta = isObject(event.delta) ? event.delta : null;
    if (delta && typeof delta.stop_reason === "string") {
      this.lastStopReason = delta.stop_reason;
    }

    const usage = isObject(event.usage) ? parseUsage(event.usage) : undefined;
    if (usage) {
      this.lastUsage = usage;
    }
  }

  // ── Result line handling ──────────────────────────────────────────────

  private storeResultData(parsed: Record<string, unknown>): void {
    const usage = isObject(parsed.usage) ? parsed.usage : null;

    this.resultData = {
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : undefined,
      costUsd: typeof parsed.cost_usd === "number" ? parsed.cost_usd : undefined,
      durationApiMs:
        typeof parsed.duration_api_ms === "number" ? parsed.duration_api_ms : undefined,
      numTurns: typeof parsed.num_turns === "number" ? parsed.num_turns : undefined,
      subtype: typeof parsed.subtype === "string" ? parsed.subtype : undefined,
      usage: usage ? parseUsage(usage) : undefined,
    };
  }

  // ── Done event enrichment ─────────────────────────────────────────────

  private enrichDoneEvent(event: AgentDoneEvent): void {
    const { result } = event;

    result.text = this.accumulatedText;
    result.sessionId = this.resultData?.sessionId ?? this.currentSessionId;
    result.stopReason = this.lastStopReason ?? this.resultData?.subtype;

    // Prefer result-line usage (cumulative) over message_delta usage (partial)
    result.usage = this.resultData?.usage ?? this.lastUsage;

    if (this.resultData?.costUsd !== undefined) {
      result.totalCostUsd = this.resultData.costUsd;
    }
    if (this.resultData?.durationApiMs !== undefined) {
      result.apiDurationMs = this.resultData.durationApiMs;
    }
    if (this.resultData?.numTurns !== undefined) {
      result.numTurns = this.resultData.numTurns;
    }
  }

  // ── State reset ───────────────────────────────────────────────────────

  private resetState(): void {
    this.currentSessionId = undefined;
    this.accumulatedText = "";
    this.toolBuffer = null;
    this.lastUsage = undefined;
    this.lastStopReason = undefined;
    this.resultData = undefined;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

type ResultLineData = {
  sessionId: string | undefined;
  costUsd: number | undefined;
  durationApiMs: number | undefined;
  numTurns: number | undefined;
  subtype: string | undefined;
  usage: AgentUsage | undefined;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUsage(raw: Record<string, unknown>): AgentUsage {
  return {
    inputTokens: typeof raw.input_tokens === "number" ? raw.input_tokens : 0,
    outputTokens: typeof raw.output_tokens === "number" ? raw.output_tokens : 0,
    ...(typeof raw.cache_read_input_tokens === "number"
      ? { cacheReadTokens: raw.cache_read_input_tokens }
      : {}),
    ...(typeof raw.cache_creation_input_tokens === "number"
      ? { cacheWriteTokens: raw.cache_creation_input_tokens }
      : {}),
  };
}
