import type { ChannelId } from "../channels/plugins/types.js";
import type { AgentModelConfig, AgentSandboxConfig } from "./types.agents-shared.js";
import type {
  BlockStreamingChunkConfig,
  BlockStreamingCoalesceConfig,
  HumanDelayConfig,
  TypingMode,
} from "./types.base.js";

/**
 * Per-model entry in the `agents.defaults.models` map.
 * Kept as a named type for legacy config compat; model management
 * infrastructure has been removed — CLIs own model selection.
 */
export type AgentModelEntryConfig = {
  alias?: string;
  params?: Record<string, unknown>;
  streaming?: boolean;
};

export type AgentContextPruningConfig = {
  mode?: "off" | "cache-ttl";
  /** TTL to consider cache expired (duration string, default unit: minutes). */
  ttl?: string;
  keepLastAssistants?: number;
  softTrimRatio?: number;
  hardClearRatio?: number;
  minPrunableToolChars?: number;
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  softTrim?: {
    maxChars?: number;
    headChars?: number;
    tailChars?: number;
  };
  hardClear?: {
    enabled?: boolean;
    placeholder?: string;
  };
};

export type AgentDefaultsConfig = {
  /**
   * Legacy model config fields — accepted by the Zod schema as `unknown`
   * for backwards compat but no longer used by the runtime.
   * CLIs own model selection; RemoteClaw is middleware.
   */
  model?: AgentModelConfig;
  /** Legacy image-model override (kept for config compat). */
  imageModel?: unknown;
  /** Legacy per-model settings map (kept for config compat). */
  models?: Record<string, AgentModelEntryConfig>;
  /** Agent working directory (preferred). Used as the default cwd for agent runs. */
  workspace?: string;
  /** Optional repository root for system prompt runtime line (overrides auto-detect). */
  repoRoot?: string;
  /** Optional IANA timezone for the user (used in system prompt; defaults to host timezone). */
  userTimezone?: string;
  /** Time format in system prompt: auto (OS preference), 12-hour, or 24-hour. */
  timeFormat?: "auto" | "12" | "24";
  /**
   * Envelope timestamp timezone: "utc" (default), "local", "user", or an IANA timezone string.
   */
  envelopeTimezone?: string;
  /**
   * Include absolute timestamps in message envelopes ("on" | "off", default: "on").
   */
  envelopeTimestamp?: "on" | "off";
  /**
   * Include elapsed time in message envelopes ("on" | "off", default: "on").
   */
  envelopeElapsed?: "on" | "off";
  /** Optional context window cap (used for runtime estimates + status %). */
  contextTokens?: number;
  /** Legacy CLI-backends config (kept for config compat). */
  cliBackends?: unknown;
  /** Opt-in: prune old tool results from the LLM context to reduce token usage. */
  contextPruning?: AgentContextPruningConfig;
  /** Default verbose level when no /verbose directive is present. */
  verboseDefault?: "off" | "on" | "full";
  /** Default block streaming level when no override is present. */
  blockStreamingDefault?: "off" | "on";
  /**
   * Block streaming boundary:
   * - "text_end": end of each assistant text content block (before tool calls)
   * - "message_end": end of the whole assistant message (may include tool blocks)
   */
  blockStreamingBreak?: "text_end" | "message_end";
  /** Soft block chunking for streamed replies (min/max chars, prefer paragraph/newline). */
  blockStreamingChunk?: BlockStreamingChunkConfig;
  /**
   * Block reply coalescing (merge streamed chunks before send).
   * idleMs: wait time before flushing when idle.
   */
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
  /** Human-like delay between block replies. */
  humanDelay?: HumanDelayConfig;
  timeoutSeconds?: number;
  /** Max inbound media size in MB for agent-visible attachments (text note or future image attach). */
  mediaMaxMb?: number;
  /**
   * Max image side length (pixels) when sanitizing base64 image payloads in transcripts/tool results.
   * Default: 1200.
   */
  imageMaxDimensionPx?: number;
  typingIntervalSeconds?: number;
  /** Typing indicator start mode (never|instant|thinking|message). */
  typingMode?: TypingMode;
  /** Periodic background heartbeat runs. */
  heartbeat?: {
    /** Heartbeat interval (duration string, default unit: minutes; default: 30m). */
    every?: string;
    /** Optional active-hours window (local time); heartbeats run only inside this window. */
    activeHours?: {
      /** Start time (24h, HH:MM). Inclusive. */
      start?: string;
      /** End time (24h, HH:MM). Exclusive. Use "24:00" for end-of-day. */
      end?: string;
      /** Timezone for the window ("user", "local", or IANA TZ id). Default: "user". */
      timezone?: string;
    };
    /** Heartbeat model override (provider/model). */
    model?: string;
    /** Session key for heartbeat runs ("main" or explicit session key). */
    session?: string;
    /** Delivery target ("last", "none", or a channel id). */
    target?: "last" | "none" | ChannelId;
    /** Optional delivery override (E.164 for WhatsApp, chat id for Telegram). Supports :topic:NNN suffix for Telegram topics. */
    to?: string;
    /** Optional account id for multi-account channels. */
    accountId?: string;
    /** Override the heartbeat prompt body (default: "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats."). */
    prompt?: string;
    /** Path to a file containing the heartbeat prompt (relative to workspace, read at runtime). prompt takes precedence if both set. */
    file?: string;
    /** Suppress tool error warning payloads during heartbeat runs. */
    suppressToolErrorWarnings?: boolean;
  };
  /** Boot prompt configuration (runs on gateway startup). */
  boot?: {
    /** Inline boot prompt text. Takes precedence over `file` if both are set. */
    prompt?: string;
    /** Path to a boot prompt file (relative to workspace directory). */
    file?: string;
  };
  /** Max concurrent agent runs across all conversations. Default: 1 (sequential). */
  maxConcurrent?: number;
  /** Sub-agent defaults (spawned via sessions_spawn). */
  subagents?: {
    /** Max concurrent sub-agent runs (global lane: "subagent"). Default: 1. */
    maxConcurrent?: number;
    /** Maximum depth allowed for sessions_spawn chains. Default behavior: 1 (no nested spawns). */
    maxSpawnDepth?: number;
    /** Maximum active children a single requester session may spawn. Default behavior: 5. */
    maxChildrenPerAgent?: number;
    /** Auto-archive sub-agent sessions after N minutes (default: 60). */
    archiveAfterMinutes?: number;
    /** Legacy sub-agent model override (kept for config compat). */
    model?: unknown;
    /** Default run timeout in seconds for spawned sub-agents (0 = no timeout). */
    runTimeoutSeconds?: number;
    /** Gateway timeout in ms for sub-agent announce delivery calls (default: 60000). */
    announceTimeoutMs?: number;
  };
  /** Glob patterns for files exposed via agents.files.list/get/set (default: []). */
  editableFiles?: string[];
  /** Optional sandbox settings for non-main sessions. */
  sandbox?: AgentSandboxConfig;
  /** Selected agent runtime (claude, gemini, codex, opencode). */
  runtime?: "claude" | "gemini" | "codex" | "opencode";
  /** Extra CLI arguments appended to every runtime invocation. */
  runtimeArgs?: string[];
  /** Extra environment variables injected into every runtime invocation. */
  runtimeEnv?: Record<string, string>;
  /**
   * Default auth profile(s) for all agents. Per-agent `auth` overrides this.
   * - `false` — skip auth profile injection (default)
   * - `"provider:profile"` — single profile
   * - `["provider:key1", "provider:key2"]` — round-robin rotation
   */
  auth?: false | string | string[];
};
