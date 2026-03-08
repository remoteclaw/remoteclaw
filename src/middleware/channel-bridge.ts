import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReplyPayload } from "../auto-reply/types.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
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
  /** Extra CLI arguments appended to every runtime invocation. */
  runtimeArgs?: string[] | undefined;
  /** Extra environment variables injected into every runtime invocation. */
  runtimeEnv?: Record<string, string> | undefined;
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
  readonly #runtimeArgs: string[] | undefined;
  readonly #runtimeEnv: Record<string, string> | undefined;

  constructor(options: ChannelBridgeOptions) {
    this.#provider = options.provider;
    this.#sessionMap = options.sessionMap;
    this.#gatewayUrl = options.gatewayUrl;
    this.#gatewayToken = options.gatewayToken;
    this.#workspaceDir = options.workspaceDir ?? DEFAULT_WORKSPACE_DIR;
    this.#chunkLimit = options.chunkLimit;
    this.#mcpServerPath = options.mcpServerPath ?? DEFAULT_MCP_SERVER_PATH;
    this.#runtimeArgs = options.runtimeArgs;
    this.#runtimeEnv = options.runtimeEnv;
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
    const hookRunner = getGlobalHookRunner();

    // Hook: session_resumed — fires when reusing an existing session
    if (existingSessionId && hookRunner?.hasHooks("session_resumed")) {
      await hookRunner.runSessionResumed(
        {
          sessionId: existingSessionId,
          runtimeName: this.#provider,
          channelId: message.channelId,
          userId: message.from,
          resumeMethod: "session_map",
        },
        {
          sessionId: existingSessionId,
          channelId: message.channelId,
          runtimeName: this.#provider,
        },
      );
    }

    // 2. System prompt
    const systemPrompt = buildSystemPrompt({
      channelName: message.provider,
      workspaceDir: this.#workspaceDir,
      messageToolHints: message.messageToolHints,
      userName: message.userName,
      agentId: message.agentId,
      timezone: message.timezone,
      authorizedSenders: message.authorizedSenders,
      reactionGuidance: message.reactionGuidance,
    });

    // 3. MCP config: temp dir for side effects file
    const invocationDir = await createInvocationDir();
    const sideEffectsFile = join(invocationDir, "side-effects.ndjson");

    try {
      const mcpServers = this.#buildMcpConfig(message, sessionKey, sideEffectsFile);

      // 4. Runtime params
      const runtime = createCliRuntime(this.#provider);
      let workspaceDir = this.#workspaceDir;
      let hookEnv: Record<string, string> | undefined;
      const runId = randomUUID();

      // Hook: before_runtime_spawn — extensions can modify env and workspaceDir
      if (hookRunner?.hasHooks("before_runtime_spawn")) {
        const spawnResult = await hookRunner.runBeforeRuntimeSpawn(
          {
            runtimeName: this.#provider,
            sessionId: existingSessionId,
            command: "node",
            args: [this.#mcpServerPath],
            env: mcpServers.remoteclaw?.env ?? {},
            workspaceDir,
            channelId: message.channelId,
          },
          {
            sessionId: existingSessionId,
            channelId: message.channelId,
            runtimeName: this.#provider,
          },
        );
        if (spawnResult?.workspaceDir) {
          workspaceDir = spawnResult.workspaceDir;
        }
        if (spawnResult?.env) {
          hookEnv = spawnResult.env;
        }
      }

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
            prompt:
              systemPrompt +
              (message.extraContext ? "\n\n" + message.extraContext : "") +
              "\n\n" +
              message.text,
            sessionId: existingSessionId,
            mcpServers,
            abortSignal,
            workingDirectory: workspaceDir,
            env: this.#runtimeEnv || hookEnv ? { ...this.#runtimeEnv, ...hookEnv } : undefined,
            extraArgs: this.#runtimeArgs,
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

      // Hooks: after_runtime_exit + agent_end — fire after session update
      const finalResult = runResult ?? { ...DEFAULT_RUN_RESULT };
      if (hookRunner) {
        const runtimeCtx = {
          sessionId: finalResult.sessionId,
          channelId: message.channelId,
          runtimeName: this.#provider,
        };

        if (hookRunner.hasHooks("after_runtime_exit")) {
          void hookRunner.runAfterRuntimeExit(
            {
              runtimeName: this.#provider,
              sessionId: finalResult.sessionId,
              exitCode: finalResult.errorSubtype ? 1 : 0,
              durationMs: finalResult.durationMs,
              stdout: finalResult.text,
              stderr: lastError,
              mcpSideEffects: {
                sentTexts: mcp.sentTexts,
                sentMediaUrls: mcp.sentMediaUrls,
                cronAdds: mcp.cronAdds,
              },
            },
            runtimeCtx,
          );
        }

        if (hookRunner.hasHooks("agent_end")) {
          void hookRunner.runAgentEnd(
            {
              runId,
              sessionId: finalResult.sessionId,
              success: !finalResult.errorSubtype && !lastError,
              durationMs: finalResult.durationMs,
            },
            runtimeCtx,
          );
        }
      }

      // 10. Return result
      return {
        payloads,
        run: finalResult,
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
          REMOTECLAW_SENDER_IS_OWNER: String(message.senderIsOwner ?? false),
          REMOTECLAW_TOOL_PROFILE: message.toolProfile ?? "full",
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
