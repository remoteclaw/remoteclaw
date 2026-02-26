import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReplyPayload } from "../auto-reply/types.js";
import { DeliveryAdapter } from "./delivery-adapter.js";
import { classifyError } from "./error-classifier.js";
import { readMcpSideEffects } from "./mcp-side-effects.js";
import { createCliRuntime } from "./runtime-factory.js";
import type { SessionKey, SessionMap } from "./session-map.js";
import { buildSystemPrompt } from "./system-prompt.js";
import type {
  AgentDeliveryResult,
  AgentEvent,
  AgentRunResult,
  BridgeCallbacks,
  ChannelMessage,
  McpServerConfig,
  McpSideEffects,
} from "./types.js";

/** Options for constructing a {@link ChannelBridge}. */
export type ChannelBridgeOptions = {
  /** CLI runtime provider ("claude", "gemini", "codex", "opencode"). */
  provider: string;
  /** Session map for session persistence. */
  sessionMap: SessionMap;
  /** Gateway URL for MCP server WebSocket connection. */
  gatewayUrl: string;
  /** Gateway auth token for MCP server. */
  gatewayToken: string;
  /** Working directory for CLI subprocess. */
  workspaceDir?: string | undefined;
  /** Channel text chunk limit (default: 4000). */
  chunkLimit?: number | undefined;
  /** MCP server entry point path. */
  mcpServerPath?: string | undefined;
};

const DEFAULT_WORKSPACE_DIR = ".";
const DEFAULT_MCP_SERVER_PATH = join("dist", "middleware", "mcp-server.js");

const EMPTY_SIDE_EFFECTS: McpSideEffects = {
  sentTexts: [],
  sentMediaUrls: [],
  sentTargets: [],
  cronAdds: 0,
};

const DEFAULT_RUN_RESULT: AgentRunResult = {
  text: "",
  sessionId: undefined,
  durationMs: 0,
  usage: undefined,
  aborted: false,
};

/**
 * Central orchestrator connecting incoming channel messages to CLI agent execution and delivery.
 *
 * `handle()` is the single entry point for all dispatch sites: agent command, auto-reply,
 * cron, and follow-up. It wires together runtime factory, session map, error classifier,
 * delivery adapter, system prompt builder, and MCP side effects.
 */
export class ChannelBridge {
  readonly #provider: string;
  readonly #sessionMap: SessionMap;
  readonly #gatewayUrl: string;
  readonly #gatewayToken: string;
  readonly #workspaceDir: string;
  readonly #chunkLimit: number | undefined;
  readonly #mcpServerPath: string;

  constructor(options: ChannelBridgeOptions) {
    this.#provider = options.provider;
    this.#sessionMap = options.sessionMap;
    this.#gatewayUrl = options.gatewayUrl;
    this.#gatewayToken = options.gatewayToken;
    this.#workspaceDir = options.workspaceDir ?? DEFAULT_WORKSPACE_DIR;
    this.#chunkLimit = options.chunkLimit;
    this.#mcpServerPath = options.mcpServerPath ?? DEFAULT_MCP_SERVER_PATH;
  }

  /**
   * Process an incoming channel message through the full agent execution pipeline.
   *
   * Flow: session lookup → system prompt → MCP config → runtime execution →
   * event streaming → error classification → side effects → session update → result assembly.
   */
  async handle(
    message: ChannelMessage,
    callbacks?: BridgeCallbacks,
    abortSignal?: AbortSignal,
  ): Promise<AgentDeliveryResult> {
    // 1. Session lookup
    const sessionKey = buildSessionKey(message);
    const existingSessionId = await this.#sessionMap.get(sessionKey);

    // 2. System prompt
    const systemPrompt = buildSystemPrompt({
      channelName: message.provider,
      workspaceDir: this.#workspaceDir,
      messageToolHints: message.messageToolHints,
    });

    // 3. MCP config: temp dir for side effects file
    const invocationDir = await createInvocationDir();
    const sideEffectsFile = join(invocationDir, "side-effects.ndjson");

    try {
      const mcpServers = this.#buildMcpConfig(message, sessionKey, sideEffectsFile);

      // 4. Runtime params
      const runtime = createCliRuntime(this.#provider);

      // 5-6. Execute + stream events through DeliveryAdapter
      const adapter = new DeliveryAdapter(
        this.#chunkLimit !== undefined ? { chunkLimit: this.#chunkLimit } : undefined,
      );

      let runResult: AgentRunResult | undefined;
      let lastError: string | undefined;
      let payloads: ReplyPayload[];

      try {
        const captured = captureResult(
          runtime.execute({
            prompt: systemPrompt + "\n\n" + message.text,
            sessionId: existingSessionId,
            mcpServers,
            abortSignal,
            workingDirectory: this.#workspaceDir,
          }),
        );
        payloads = await adapter.process(captured.events, callbacks);
        runResult = captured.getResult();
        lastError = captured.getError();
      } catch (err) {
        // 7. Error classification
        const errMsg = String(err);
        const category = classifyError(errMsg);
        lastError = errMsg;
        payloads = [];
        runResult = {
          ...DEFAULT_RUN_RESULT,
          // ErrorClassifier uses "context_overflow"; AgentRunResult uses "context_window"
          errorSubtype: category === "context_overflow" ? "context_window" : category,
        };
      }

      // 8. Read MCP side effects
      let mcp: McpSideEffects;
      try {
        mcp = await readMcpSideEffects(sideEffectsFile);
      } catch {
        mcp = { ...EMPTY_SIDE_EFFECTS };
      }

      // 9. Session update
      if (runResult?.sessionId) {
        await this.#sessionMap.set(sessionKey, runResult.sessionId);
      }

      // 10. Return result
      return {
        payloads,
        run: runResult ?? { ...DEFAULT_RUN_RESULT },
        mcp,
        error: lastError,
      };
    } finally {
      // Cleanup temp directory
      await rm(invocationDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Build MCP server configuration for the remoteclaw MCP server. */
  #buildMcpConfig(
    message: ChannelMessage,
    sessionKey: SessionKey,
    sideEffectsFile: string,
  ): Record<string, McpServerConfig> {
    return {
      remoteclaw: {
        command: "node",
        args: [this.#mcpServerPath],
        env: {
          REMOTECLAW_GATEWAY_URL: this.#gatewayUrl,
          REMOTECLAW_GATEWAY_TOKEN: this.#gatewayToken,
          REMOTECLAW_SESSION_KEY: formatSessionKeyString(sessionKey),
          REMOTECLAW_SIDE_EFFECTS_FILE: sideEffectsFile,
          REMOTECLAW_CHANNEL: message.provider,
          REMOTECLAW_ACCOUNT_ID: message.from,
          REMOTECLAW_TO: message.channelId,
          ...(message.replyToId ? { REMOTECLAW_THREAD_ID: message.replyToId } : {}),
        },
      },
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a SessionKey from a ChannelMessage. */
export function buildSessionKey(message: ChannelMessage): SessionKey {
  return {
    channelId: message.channelId,
    userId: message.from,
    threadId: message.replyToId,
  };
}

/** Format a SessionKey as a composite string (for env vars). */
function formatSessionKeyString(key: SessionKey): string {
  return `${key.channelId}:${key.userId}:${key.threadId ?? "_"}`;
}

/** Create a unique temp directory for an invocation. */
async function createInvocationDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "rc-"));
}

/**
 * Wrap an event stream to capture the AgentRunResult from the done event
 * and any error messages, while passing all events through to the consumer.
 */
function captureResult(events: AsyncIterable<AgentEvent>): {
  events: AsyncIterable<AgentEvent>;
  getResult: () => AgentRunResult | undefined;
  getError: () => string | undefined;
} {
  let result: AgentRunResult | undefined;
  let error: string | undefined;

  async function* wrapped(): AsyncIterable<AgentEvent> {
    for await (const event of events) {
      if (event.type === "done") {
        result = event.result;
      } else if (event.type === "error") {
        error = event.message;
      }
      yield event;
    }
  }

  return {
    events: wrapped(),
    getResult: () => result,
    getError: () => error,
  };
}
