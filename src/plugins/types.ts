import type { IncomingMessage, ServerResponse } from "node:http";
import type { Command } from "commander";
import type { AuthProfileCredential } from "../agents/auth-profiles/types.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { ChannelDock } from "../channels/dock.js";
import type { ChannelId, ChannelPlugin } from "../channels/plugins/types.js";
import type { createVpsAwareOAuthHandlers } from "../commands/oauth-flow.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { ModelProviderConfig } from "../config/types.js";
import type { GatewayRequestHandler } from "../gateway/server-methods/types.js";
import type { InternalHookHandler } from "../hooks/internal-hooks.js";
import type { HookEntry } from "../hooks/types.js";
import type { RuntimeEnv } from "../runtime.js";
import type { AgentMessage } from "../types/agent-types.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { PluginRuntime } from "./runtime/types.js";

export type { PluginRuntime } from "./runtime/types.js";
export type { AnyAgentTool } from "../agents/tools/common.js";

export type PluginLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type PluginConfigUiHint = {
  label?: string;
  help?: string;
  tags?: string[];
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
};

export type PluginKind = string;

export type PluginConfigValidation =
  | { ok: true; value?: unknown }
  | { ok: false; errors: string[] };

export type RemoteClawPluginConfigSchema = {
  safeParse?: (value: unknown) => {
    success: boolean;
    data?: unknown;
    error?: {
      issues?: Array<{ path: Array<string | number>; message: string }>;
    };
  };
  parse?: (value: unknown) => unknown;
  validate?: (value: unknown) => PluginConfigValidation;
  uiHints?: Record<string, PluginConfigUiHint>;
  jsonSchema?: Record<string, unknown>;
};

export type RemoteClawPluginToolContext = {
  config?: RemoteClawConfig;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  messageChannel?: string;
  agentAccountId?: string;
  sandboxed?: boolean;
};

export type RemoteClawPluginToolFactory = (
  ctx: RemoteClawPluginToolContext,
) => AnyAgentTool | AnyAgentTool[] | null | undefined;

export type RemoteClawPluginToolOptions = {
  name?: string;
  names?: string[];
  optional?: boolean;
};

export type RemoteClawPluginHookOptions = {
  entry?: HookEntry;
  name?: string;
  description?: string;
  register?: boolean;
};

export type ProviderAuthKind = "oauth" | "api_key" | "token" | "device_code" | "custom";

export type ProviderAuthResult = {
  profiles: Array<{ profileId: string; credential: AuthProfileCredential }>;
  configPatch?: Partial<RemoteClawConfig>;
  defaultModel?: string;
  notes?: string[];
};

export type ProviderAuthContext = {
  config: RemoteClawConfig;
  agentDir?: string;
  workspaceDir?: string;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  oauth: {
    createVpsAwareHandlers: typeof createVpsAwareOAuthHandlers;
  };
};

export type ProviderAuthMethod = {
  id: string;
  label: string;
  hint?: string;
  kind: ProviderAuthKind;
  run: (ctx: ProviderAuthContext) => Promise<ProviderAuthResult>;
};

export type ProviderPlugin = {
  id: string;
  label: string;
  docsPath?: string;
  aliases?: string[];
  envVars?: string[];
  models?: ModelProviderConfig;
  auth: ProviderAuthMethod[];
  formatApiKey?: (cred: AuthProfileCredential) => string;
};

export type RemoteClawPluginGatewayMethod = {
  method: string;
  handler: GatewayRequestHandler;
};

// =============================================================================
// Plugin Commands
// =============================================================================

/**
 * Context passed to plugin command handlers.
 */
export type PluginCommandContext = {
  /** The sender's identifier (e.g., Telegram user ID) */
  senderId?: string;
  /** The channel/surface (e.g., "telegram", "discord") */
  channel: string;
  /** Provider channel id (e.g., "telegram") */
  channelId?: ChannelId;
  /** Whether the sender is on the allowlist */
  isAuthorizedSender: boolean;
  /** Raw command arguments after the command name */
  args?: string;
  /** The full normalized command body */
  commandBody: string;
  /** Current RemoteClaw configuration */
  config: RemoteClawConfig;
  /** Raw "From" value (channel-scoped id) */
  from?: string;
  /** Raw "To" value (channel-scoped id) */
  to?: string;
  /** Account id for multi-account channels */
  accountId?: string;
  /** Thread/topic id if available */
  messageThreadId?: number;
};

/**
 * Result returned by a plugin command handler.
 */
export type PluginCommandResult = ReplyPayload;

/**
 * Handler function for plugin commands.
 */
export type PluginCommandHandler = (
  ctx: PluginCommandContext,
) => PluginCommandResult | Promise<PluginCommandResult>;

/**
 * Definition for a plugin-registered command.
 */
export type RemoteClawPluginCommandDefinition = {
  /** Command name without leading slash (e.g., "tts") */
  name: string;
  /** Description shown in /help and command menus */
  description: string;
  /** Whether this command accepts arguments */
  acceptsArgs?: boolean;
  /** Whether only authorized senders can use this command (default: true) */
  requireAuth?: boolean;
  /** The handler function */
  handler: PluginCommandHandler;
};

export type RemoteClawPluginHttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean> | boolean;

export type RemoteClawPluginHttpRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void;

export type RemoteClawPluginCliContext = {
  program: Command;
  config: RemoteClawConfig;
  workspaceDir?: string;
  logger: PluginLogger;
};

export type RemoteClawPluginCliRegistrar = (
  ctx: RemoteClawPluginCliContext,
) => void | Promise<void>;

export type RemoteClawPluginServiceContext = {
  config: RemoteClawConfig;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
};

export type RemoteClawPluginService = {
  id: string;
  start: (ctx: RemoteClawPluginServiceContext) => void | Promise<void>;
  stop?: (ctx: RemoteClawPluginServiceContext) => void | Promise<void>;
};

export type RemoteClawPluginChannelRegistration = {
  plugin: ChannelPlugin;
  dock?: ChannelDock;
};

export type RemoteClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  kind?: PluginKind;
  configSchema?: RemoteClawPluginConfigSchema;
  register?: (api: RemoteClawPluginApi) => void | Promise<void>;
  activate?: (api: RemoteClawPluginApi) => void | Promise<void>;
};

export type RemoteClawPluginModule =
  | RemoteClawPluginDefinition
  | ((api: RemoteClawPluginApi) => void | Promise<void>);

export type RemoteClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: RemoteClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  registerTool: (
    tool: AnyAgentTool | RemoteClawPluginToolFactory,
    opts?: RemoteClawPluginToolOptions,
  ) => void;
  registerHook: (
    events: string | string[],
    handler: InternalHookHandler,
    opts?: RemoteClawPluginHookOptions,
  ) => void;
  registerHttpHandler: (handler: RemoteClawPluginHttpHandler) => void;
  registerHttpRoute: (params: { path: string; handler: RemoteClawPluginHttpRouteHandler }) => void;
  registerChannel: (registration: RemoteClawPluginChannelRegistration | ChannelPlugin) => void;
  registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;
  registerCli: (registrar: RemoteClawPluginCliRegistrar, opts?: { commands?: string[] }) => void;
  registerService: (service: RemoteClawPluginService) => void;
  /**
   * Register a custom command that bypasses the LLM agent.
   * Plugin commands are processed before built-in commands and before agent invocation.
   * Use this for simple state-toggling or status commands that don't need AI reasoning.
   */
  registerCommand: (command: RemoteClawPluginCommandDefinition) => void;
  resolvePath: (input: string) => string;
  /** Register a lifecycle hook handler */
  on: <K extends PluginHookName>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number },
  ) => void;
};

export type PluginOrigin = "bundled" | "global" | "workspace" | "config";

export type PluginDiagnostic = {
  level: "warn" | "error";
  message: string;
  pluginId?: string;
  source?: string;
};

// ============================================================================
// Plugin Hooks
// ============================================================================

export type PluginHookName =
  | "before_reset"
  | "message_received"
  | "message_sending"
  | "message_sent"
  | "before_tool_call"
  | "after_tool_call"
  | "before_message_write"
  | "session_start"
  | "session_end"
  | "subagent_spawning"
  | "subagent_delivery_target"
  | "subagent_spawned"
  | "subagent_ended"
  | "gateway_start"
  | "gateway_stop"
  | "before_runtime_spawn"
  | "after_runtime_exit"
  | "session_resumed"
  | "agent_end";

// Agent context shared across agent hooks
export type PluginHookAgentContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
};

// before_reset hook — fired when /new or /reset clears a session
export type PluginHookBeforeResetEvent = {
  sessionFile?: string;
  messages?: unknown[];
  reason?: string;
};

// Message context
export type PluginHookMessageContext = {
  channelId: string;
  accountId?: string;
  conversationId?: string;
};

// message_received hook
export type PluginHookMessageReceivedEvent = {
  from: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

// message_sending hook
export type PluginHookMessageSendingEvent = {
  to: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type PluginHookMessageSendingResult = {
  content?: string;
  cancel?: boolean;
};

// message_sent hook
export type PluginHookMessageSentEvent = {
  to: string;
  content: string;
  success: boolean;
  error?: string;
};

// Tool context
export type PluginHookToolContext = {
  agentId?: string;
  sessionKey?: string;
  toolName: string;
};

// before_tool_call hook
export type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

export type PluginHookBeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
};

// after_tool_call hook
export type PluginHookAfterToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

// before_message_write hook
export type PluginHookBeforeMessageWriteEvent = {
  message: AgentMessage;
  sessionKey?: string;
  agentId?: string;
};

export type PluginHookBeforeMessageWriteResult = {
  block?: boolean; // If true, message is NOT written to JSONL
  message?: AgentMessage; // Optional: modified message to write instead
};

// Session context
export type PluginHookSessionContext = {
  agentId?: string;
  sessionId: string;
};

// session_start hook
export type PluginHookSessionStartEvent = {
  sessionId: string;
  resumedFrom?: string;
};

// session_end hook
export type PluginHookSessionEndEvent = {
  sessionId: string;
  messageCount: number;
  durationMs?: number;
};

// Subagent context
export type PluginHookSubagentContext = {
  runId?: string;
  childSessionKey?: string;
  requesterSessionKey?: string;
};

export type PluginHookSubagentTargetKind = "subagent" | "acp";

// subagent_spawning hook
export type PluginHookSubagentSpawningEvent = {
  childSessionKey: string;
  agentId: string;
  label?: string;
  mode: "run" | "session";
  requester?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
  threadRequested: boolean;
};

export type PluginHookSubagentSpawningResult =
  | {
      status: "ok";
      threadBindingReady?: boolean;
    }
  | {
      status: "error";
      error: string;
    };

// subagent_delivery_target hook
export type PluginHookSubagentDeliveryTargetEvent = {
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
  childRunId?: string;
  spawnMode?: "run" | "session";
  expectsCompletionMessage: boolean;
};

export type PluginHookSubagentDeliveryTargetResult = {
  origin?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
};

// subagent_spawned hook
export type PluginHookSubagentSpawnedEvent = {
  runId: string;
  childSessionKey: string;
  agentId: string;
  label?: string;
  mode: "run" | "session";
  requester?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
  threadRequested: boolean;
};

// subagent_ended hook
export type PluginHookSubagentEndedEvent = {
  targetSessionKey: string;
  targetKind: PluginHookSubagentTargetKind;
  reason: string;
  sendFarewell?: boolean;
  accountId?: string;
  runId?: string;
  endedAt?: number;
  outcome?: "ok" | "error" | "timeout" | "killed" | "reset" | "deleted";
  error?: string;
};

// Gateway context
export type PluginHookGatewayContext = {
  port?: number;
};

// gateway_start hook
export type PluginHookGatewayStartEvent = {
  port: number;
};

// gateway_stop hook
export type PluginHookGatewayStopEvent = {
  reason?: string;
};

// ── ChannelBridge Runtime Hooks ──────────────────────────────────────────

// before_runtime_spawn hook — fired before CLI subprocess starts (modifiable)
export type PluginHookBeforeRuntimeSpawnEvent = {
  runtimeName: string;
  sessionId: string | undefined;
  command: string;
  args: string[];
  env: Record<string, string>;
  workspaceDir: string;
  channelId: string;
};

export type PluginHookBeforeRuntimeSpawnResult = {
  env?: Record<string, string>;
  workspaceDir?: string;
};

// after_runtime_exit hook — fired after CLI subprocess exits (observe-only)
export type PluginHookAfterRuntimeExitEvent = {
  runtimeName: string;
  sessionId: string | undefined;
  exitCode: number | undefined;
  durationMs: number;
  stdout: string;
  stderr: string | undefined;
  mcpSideEffects: {
    sentTexts: string[];
    sentMediaUrls: string[];
    cronAdds: number;
  };
};

// session_resumed hook — fired when an existing session is reused
export type PluginHookSessionResumedEvent = {
  sessionId: string;
  runtimeName: string;
  channelId: string;
  userId: string;
  resumeMethod: "session_map";
};

// agent_end hook — reconstructed from CLI subprocess exit
export type PluginHookAgentEndEvent = {
  runId: string;
  sessionId: string | undefined;
  success: boolean;
  durationMs: number;
};

// Runtime hook context (shared across before_runtime_spawn / after_runtime_exit)
export type PluginHookRuntimeContext = {
  sessionId?: string;
  channelId: string;
  runtimeName: string;
};

// Hook handler types mapped by hook name
export type PluginHookHandlerMap = {
  before_reset: (
    event: PluginHookBeforeResetEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<void> | void;
  message_received: (
    event: PluginHookMessageReceivedEvent,
    ctx: PluginHookMessageContext,
  ) => Promise<void> | void;
  message_sending: (
    event: PluginHookMessageSendingEvent,
    ctx: PluginHookMessageContext,
  ) => Promise<PluginHookMessageSendingResult | void> | PluginHookMessageSendingResult | void;
  message_sent: (
    event: PluginHookMessageSentEvent,
    ctx: PluginHookMessageContext,
  ) => Promise<void> | void;
  before_tool_call: (
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ) => Promise<PluginHookBeforeToolCallResult | void> | PluginHookBeforeToolCallResult | void;
  after_tool_call: (
    event: PluginHookAfterToolCallEvent,
    ctx: PluginHookToolContext,
  ) => Promise<void> | void;
  before_message_write: (
    event: PluginHookBeforeMessageWriteEvent,
    ctx: { agentId?: string; sessionKey?: string },
  ) => PluginHookBeforeMessageWriteResult | void;
  session_start: (
    event: PluginHookSessionStartEvent,
    ctx: PluginHookSessionContext,
  ) => Promise<void> | void;
  session_end: (
    event: PluginHookSessionEndEvent,
    ctx: PluginHookSessionContext,
  ) => Promise<void> | void;
  subagent_spawning: (
    event: PluginHookSubagentSpawningEvent,
    ctx: PluginHookSubagentContext,
  ) => Promise<PluginHookSubagentSpawningResult | void> | PluginHookSubagentSpawningResult | void;
  subagent_delivery_target: (
    event: PluginHookSubagentDeliveryTargetEvent,
    ctx: PluginHookSubagentContext,
  ) =>
    | Promise<PluginHookSubagentDeliveryTargetResult | void>
    | PluginHookSubagentDeliveryTargetResult
    | void;
  subagent_spawned: (
    event: PluginHookSubagentSpawnedEvent,
    ctx: PluginHookSubagentContext,
  ) => Promise<void> | void;
  subagent_ended: (
    event: PluginHookSubagentEndedEvent,
    ctx: PluginHookSubagentContext,
  ) => Promise<void> | void;
  gateway_start: (
    event: PluginHookGatewayStartEvent,
    ctx: PluginHookGatewayContext,
  ) => Promise<void> | void;
  gateway_stop: (
    event: PluginHookGatewayStopEvent,
    ctx: PluginHookGatewayContext,
  ) => Promise<void> | void;
  before_runtime_spawn: (
    event: PluginHookBeforeRuntimeSpawnEvent,
    ctx: PluginHookRuntimeContext,
  ) =>
    | Promise<PluginHookBeforeRuntimeSpawnResult | void>
    | PluginHookBeforeRuntimeSpawnResult
    | void;
  after_runtime_exit: (
    event: PluginHookAfterRuntimeExitEvent,
    ctx: PluginHookRuntimeContext,
  ) => Promise<void> | void;
  session_resumed: (
    event: PluginHookSessionResumedEvent,
    ctx: PluginHookRuntimeContext,
  ) => Promise<void> | void;
  agent_end: (
    event: PluginHookAgentEndEvent,
    ctx: PluginHookRuntimeContext,
  ) => Promise<void> | void;
};

export type PluginHookRegistration<K extends PluginHookName = PluginHookName> = {
  pluginId: string;
  hookName: K;
  handler: PluginHookHandlerMap[K];
  priority?: number;
  source: string;
};
