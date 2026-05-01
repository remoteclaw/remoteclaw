import {
  listAgentIds,
  resolveAgentRuntimeArgs,
  resolveAgentRuntimeEnv,
  resolveAgentRuntimeOrThrow,
  resolveSessionAgentId,
  resolveAgentWorkspaceDir,
} from "../agents/agent-scope.js";
import { resolveChannelMessageToolHints } from "../agents/channel-tools.js";
import { getCliSessionId } from "../agents/cli-session.js";
// Model management defaults gutted in RemoteClaw — CLI runtimes own model selection.
import { normalizeModelRef, normalizeProviderId } from "../agents/provider-utils.js";
import { ensureAgentWorkspace } from "../agents/workspace.js";
import { normalizeVerboseLevel, type VerboseLevel } from "../auto-reply/thinking.js";
import { formatCliCommand } from "../cli/command-format.js";
import { type CliDeps, createDefaultDeps } from "../cli/deps.js";
import { type RemoteClawConfig, loadConfig } from "../config/config.js";
import { resolveGatewayPort } from "../config/paths.js";
import {
  mergeSessionEntry,
  parseSessionThreadInfo,
  resolveAndPersistSessionFile,
  resolveAgentIdFromSessionKey,
  resolveSessionFilePathOptions,
  resolveSessionTranscriptPath,
  type SessionEntry,
  updateSessionStore,
} from "../config/sessions.js";
import { resolveGatewayCredentialsFromConfig } from "../gateway/credentials.js";
import {
  clearAgentRunContext,
  emitAgentEvent,
  registerAgentRunContext,
} from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { withAuthKeyRetry } from "../middleware/auth-key-retry.js";
import { ChannelBridge } from "../middleware/channel-bridge.js";
import type { SessionMap } from "../middleware/session-map.js";
import type { AgentDeliveryResult, ChannelMessage } from "../middleware/types.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { applyVerboseOverride } from "../sessions/level-overrides.js";
import { resolveSendPolicy } from "../sessions/send-policy.js";
import { resolveMessageChannel } from "../utils/message-channel.js";
import { deliverAgentCommandResult } from "./agent/delivery.js";
import { resolveAgentRunContext } from "./agent/run-context.js";
import { updateSessionStoreAfterAgentRun } from "./agent/session-store.js";
import { resolveSession } from "./agent/session.js";
import type { AgentCommandIngressOpts, AgentCommandOpts } from "./agent/types.js";

const log = createSubsystemLogger("commands/agent");

type OverrideFieldClearedByDelete =
  | "providerOverride"
  | "modelOverride"
  | "authProfileOverride"
  | "authProfileOverrideSource"
  | "authProfileOverrideCompactionCount"
  | "claudeCliSessionId";

const OVERRIDE_FIELDS_CLEARED_BY_DELETE: OverrideFieldClearedByDelete[] = [
  "providerOverride",
  "modelOverride",
  "authProfileOverride",
  "authProfileOverrideSource",
  "authProfileOverrideCompactionCount",
  "claudeCliSessionId",
];

type PersistSessionEntryParams = {
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath: string;
  entry: SessionEntry;
};

async function persistSessionEntry(params: PersistSessionEntryParams): Promise<void> {
  const persisted = await updateSessionStore(params.storePath, (store) => {
    const merged = mergeSessionEntry(store[params.sessionKey], params.entry);
    // Preserve explicit `delete` clears done by session override helpers.
    for (const field of OVERRIDE_FIELDS_CLEARED_BY_DELETE) {
      if (!Object.hasOwn(params.entry, field)) {
        Reflect.deleteProperty(merged, field);
      }
    }
    store[params.sessionKey] = merged;
    return merged;
  });
  params.sessionStore[params.sessionKey] = persisted;
}

// ── ChannelBridge helpers ───────────────────────────────────────────────

/**
 * Create a SessionMap-compatible adapter that bridges the agent command
 * session store to the ChannelBridge's SessionMap interface.
 *
 * `get()` returns the CLI session ID from the session entry.
 * `set()` is a no-op — session updates are handled by the caller after the run.
 */
function createSessionMapAdapter(params: { getSessionId: () => string | undefined }): SessionMap {
  return {
    async get() {
      return params.getSessionId();
    },
    async set() {
      // Session updates handled by caller (updateSessionStoreAfterAgentRun)
    },
    async delete() {
      // Session cleanup handled by caller
    },
  } as unknown as SessionMap;
}

/** Resolve gateway URL from config for local gateway. */
function resolveGatewayUrlFromConfig(cfg: RemoteClawConfig): string {
  const port = resolveGatewayPort(cfg);
  return `ws://127.0.0.1:${port}`;
}

/** Resolve gateway auth token from config. */
function resolveGatewayTokenFromConfig(cfg: RemoteClawConfig): string {
  return resolveGatewayCredentialsFromConfig({ cfg, env: process.env }).token ?? "";
}

/** Build a ChannelMessage from the CLI command context. */
function buildCliChannelMessage(params: {
  runId: string;
  text: string;
  accountId: string | undefined;
  channelId: string | undefined;
  messageChannel: string | undefined;
  threadId: string | undefined;
  timestamp: number;
  messageToolHints: string[] | undefined;
}): ChannelMessage {
  return {
    id: params.runId,
    text: params.text,
    from: params.accountId ?? "cli",
    channelId: params.channelId ?? "",
    provider: params.messageChannel ?? "cli",
    timestamp: params.timestamp,
    replyToId: params.threadId,
    messageToolHints: params.messageToolHints?.length ? params.messageToolHints : undefined,
    senderIsOwner: true, // CLI user is always the bot owner
  };
}

/** Mutable reference to the current session entry — allows runAgentAttempt to
 *  update the entry on session-expired retry while keeping the sessionMap
 *  adapter's closure in sync. */
type SessionEntryRef = { current: SessionEntry | undefined };

const SESSION_EXPIRED_RE = /session[_\s-]?expire/i;

/** Check whether a bridge error string indicates a CLI session expiry. */
function isSessionExpiredBridgeError(error: string | undefined): boolean {
  return !!error && SESSION_EXPIRED_RE.test(error);
}

/**
 * Execute an agent run via ChannelBridge with session-expired retry.
 *
 * On session_expired errors the stale CLI session is cleared and the bridge
 * dispatch is retried once with a fresh (sessionless) invocation.  The post-run
 * `updateSessionStoreAfterAgentRun` call stores the new session ID from the
 * successful retry.
 */
async function runAgentAttempt(params: {
  cfg: ReturnType<typeof loadConfig>;
  sessionAgentId: string;
  provider: string;
  runtimeEnv: Record<string, string>;
  message: ChannelMessage;
  abortSignal: AbortSignal | undefined;
  workspaceDir: string;
  runtimeArgs: string[] | undefined;
  sessionEntryRef: SessionEntryRef;
  sessionKey: string | undefined;
  sessionStore: Record<string, SessionEntry> | undefined;
  storePath: string;
}): Promise<AgentDeliveryResult> {
  const sessionMap = createSessionMapAdapter({
    getSessionId: () => getCliSessionId(params.sessionEntryRef.current, params.provider),
  });

  const bridge = new ChannelBridge({
    provider: resolveAgentRuntimeOrThrow(params.cfg, params.sessionAgentId),
    sessionMap,
    gatewayUrl: resolveGatewayUrlFromConfig(params.cfg),
    gatewayToken: resolveGatewayTokenFromConfig(params.cfg),
    workspaceDir: params.workspaceDir,
    runtimeArgs: params.runtimeArgs,
    runtimeEnv: params.runtimeEnv,
  });

  /** Run the bridge — closure allows retry with the same bridge instance. */
  const runBridgeWithSession = () => bridge.handle(params.message, undefined, params.abortSignal);

  let bridgeResult = await runBridgeWithSession();

  // Handle CLI session expired: clear stale session and retry once.
  if (
    isSessionExpiredBridgeError(bridgeResult.error) &&
    getCliSessionId(params.sessionEntryRef.current, params.provider) &&
    params.sessionKey &&
    params.sessionStore &&
    params.storePath
  ) {
    log.warn(
      `CLI session expired, clearing from session store: provider=${params.provider} sessionKey=${params.sessionKey}`,
    );

    const entry = params.sessionStore[params.sessionKey];
    if (entry) {
      const updatedEntry = { ...entry };
      const normalizedProvider = normalizeProviderId(params.provider);
      if (updatedEntry.cliSessionIds) {
        const newIds = { ...updatedEntry.cliSessionIds };
        delete newIds[normalizedProvider];
        updatedEntry.cliSessionIds = newIds;
      }
      if (normalizedProvider === "claude-cli") {
        delete updatedEntry.claudeCliSessionId;
      }
      updatedEntry.updatedAt = Date.now();

      await persistSessionEntry({
        sessionStore: params.sessionStore,
        sessionKey: params.sessionKey,
        storePath: params.storePath,
        entry: updatedEntry,
      });
      params.sessionEntryRef.current = updatedEntry;
    }

    // Retry with cleared session — bridge reads updated entry via adapter closure.
    bridgeResult = await runBridgeWithSession();
  }

  if (bridgeResult.error && bridgeResult.payloads.length === 0) {
    throw new Error(bridgeResult.error);
  }

  return bridgeResult;
}

export async function agentCommand(
  opts: AgentCommandOpts,
  runtime: RuntimeEnv = defaultRuntime,
  deps: CliDeps = createDefaultDeps(),
) {
  const body = (opts.message ?? "").trim();
  if (!body) {
    throw new Error("Message (--message) is required");
  }
  if (!opts.to && !opts.sessionId && !opts.sessionKey && !opts.agentId) {
    throw new Error("Pass --to <E.164>, --session-id, or --agent to choose a session");
  }

  const cfg = loadConfig();
  const agentIdOverrideRaw = opts.agentId?.trim();
  const agentIdOverride = agentIdOverrideRaw ? normalizeAgentId(agentIdOverrideRaw) : undefined;
  if (agentIdOverride) {
    const knownAgents = listAgentIds(cfg);
    if (!knownAgents.includes(agentIdOverride)) {
      throw new Error(
        `Unknown agent id "${agentIdOverrideRaw}". Use "${formatCliCommand("remoteclaw agents list")}" to see configured agents.`,
      );
    }
  }
  if (agentIdOverride && opts.sessionKey) {
    const sessionAgentId = resolveAgentIdFromSessionKey(opts.sessionKey);
    if (sessionAgentId !== agentIdOverride) {
      throw new Error(
        `Agent id "${agentIdOverrideRaw}" does not match session key agent "${sessionAgentId}".`,
      );
    }
  }
  const agentCfg = cfg.agents?.defaults;

  const verboseOverride = normalizeVerboseLevel(opts.verbose);
  if (opts.verbose && !verboseOverride) {
    throw new Error('Invalid verbose level. Use "on", "full", or "off".');
  }

  if (opts.timeout !== undefined) {
    const timeoutSecondsRaw = Number.parseInt(String(opts.timeout), 10);
    if (Number.isNaN(timeoutSecondsRaw) || timeoutSecondsRaw < 0) {
      throw new Error("--timeout must be a non-negative integer (seconds; 0 means no timeout)");
    }
  }

  const sessionResolution = resolveSession({
    cfg,
    to: opts.to,
    sessionId: opts.sessionId,
    sessionKey: opts.sessionKey,
    agentId: agentIdOverride,
  });

  const {
    sessionId,
    sessionKey,
    sessionEntry: resolvedSessionEntry,
    sessionStore,
    storePath,
    isNewSession: _isNewSession,
    persistedVerbose,
  } = sessionResolution;
  const sessionAgentId =
    agentIdOverride ??
    resolveSessionAgentId({
      sessionKey: sessionKey ?? opts.sessionKey?.trim(),
      config: cfg,
    });
  const workspaceDirRaw = resolveAgentWorkspaceDir(cfg, sessionAgentId);
  const workspaceDir = await ensureAgentWorkspace(workspaceDirRaw);
  let sessionEntry = resolvedSessionEntry;
  const runId = opts.runId?.trim() || sessionId;

  try {
    if (opts.deliver === true) {
      const sendPolicy = resolveSendPolicy({
        cfg,
        entry: sessionEntry,
        sessionKey,
        channel: sessionEntry?.channel,
        chatType: sessionEntry?.chatType,
      });
      if (sendPolicy === "deny") {
        throw new Error("send blocked by session policy");
      }
    }

    const resolvedVerboseLevel =
      verboseOverride ?? persistedVerbose ?? (agentCfg?.verboseDefault as VerboseLevel | undefined);

    if (sessionKey) {
      registerAgentRunContext(runId, {
        sessionKey,
        verboseLevel: resolvedVerboseLevel,
      });
    }

    // Persist explicit /command overrides to the session store when we have a key.
    if (sessionStore && sessionKey) {
      const entry = sessionStore[sessionKey] ??
        sessionEntry ?? { sessionId, updatedAt: Date.now() };
      const next: SessionEntry = { ...entry, sessionId, updatedAt: Date.now() };
      applyVerboseOverride(next, verboseOverride);
      await persistSessionEntry({
        sessionStore,
        sessionKey,
        storePath,
        entry: next,
      });
      sessionEntry = next;
    }

    const { provider: defaultProvider, model: defaultModel } = normalizeModelRef(
      "unknown",
      "unknown",
    );
    let provider = defaultProvider;
    let model = defaultModel;

    // Apply stored model overrides from the session entry.
    const storedProviderOverride = sessionEntry?.providerOverride?.trim();
    const storedModelOverride = sessionEntry?.modelOverride?.trim();
    if (storedModelOverride) {
      const candidateProvider = storedProviderOverride || defaultProvider;
      const normalizedStored = normalizeModelRef(candidateProvider, storedModelOverride);
      provider = normalizedStored.provider;
      model = normalizedStored.model;
    }
    const sessionPathOpts = resolveSessionFilePathOptions({
      agentId: sessionAgentId,
      storePath,
    });
    if (sessionStore && sessionKey) {
      const threadIdFromSessionKey = parseSessionThreadInfo(sessionKey).threadId;
      const fallbackSessionFile = !sessionEntry?.sessionFile
        ? resolveSessionTranscriptPath(
            sessionId,
            sessionAgentId,
            opts.threadId ?? threadIdFromSessionKey,
          )
        : undefined;
      const resolvedSessionFile = await resolveAndPersistSessionFile({
        sessionId,
        sessionKey,
        sessionStore,
        storePath,
        sessionEntry,
        agentId: sessionPathOpts?.agentId,
        sessionsDir: sessionPathOpts?.sessionsDir,
        fallbackSessionFile,
      });
      sessionEntry = resolvedSessionFile.sessionEntry;
    }

    const startedAt = Date.now();

    const sessionEntryRef: SessionEntryRef = { current: sessionEntry };
    let result: AgentDeliveryResult;
    try {
      const runContext = resolveAgentRunContext(opts);
      const messageChannel = resolveMessageChannel(
        runContext.messageChannel,
        opts.replyChannel ?? opts.channel,
      );

      const baseRuntimeEnv = resolveAgentRuntimeEnv(cfg, sessionAgentId);

      const messageToolHints = resolveChannelMessageToolHints({
        cfg,
        channel: messageChannel,
        accountId: runContext.accountId ?? opts.accountId,
      });

      const message = buildCliChannelMessage({
        runId,
        text: body,
        accountId: runContext.accountId ?? opts.accountId,
        channelId: opts.to,
        messageChannel,
        threadId: opts.threadId != null ? String(opts.threadId) : undefined,
        timestamp: Date.now(),
        messageToolHints,
      });

      // Execute with auth key retry — rotates to next profile on rate-limit/auth errors.
      result = await withAuthKeyRetry<AgentDeliveryResult>(
        { cfg, agentId: sessionAgentId, baseEnv: baseRuntimeEnv },
        async (runtimeEnv) =>
          runAgentAttempt({
            cfg,
            sessionAgentId,
            provider,
            runtimeEnv,
            message,
            abortSignal: opts.abortSignal,
            workspaceDir: workspaceDir.dir,
            runtimeArgs: resolveAgentRuntimeArgs(cfg, sessionAgentId),
            sessionEntryRef,
            sessionKey,
            sessionStore,
            storePath,
          }),
        (bridgeResult) => bridgeResult.error,
      );
      sessionEntry = sessionEntryRef.current;
      emitAgentEvent({
        runId,
        stream: "lifecycle",
        data: {
          phase: "end",
          startedAt,
          endedAt: Date.now(),
          aborted: result.run.aborted ?? false,
        },
      });
    } catch (err) {
      emitAgentEvent({
        runId,
        stream: "lifecycle",
        data: {
          phase: "error",
          startedAt,
          endedAt: Date.now(),
          error: String(err),
        },
      });
      throw err;
    }

    // Update token+model fields in the session store.
    if (sessionStore && sessionKey) {
      await updateSessionStoreAfterAgentRun({
        cfg,
        sessionId,
        sessionKey,
        storePath,
        sessionStore,
        defaultProvider: provider,
        defaultModel: model,
        result,
      });
    }

    const payloads = result.payloads ?? [];
    return await deliverAgentCommandResult({
      cfg,
      deps,
      runtime,
      opts,
      outboundSession: undefined,
      sessionEntry,
      result,
      payloads,
    });
  } finally {
    clearAgentRunContext(runId);
  }
}

export async function agentCommandFromIngress(
  opts: AgentCommandIngressOpts,
  runtime: RuntimeEnv = defaultRuntime,
  deps: CliDeps = createDefaultDeps(),
) {
  if (typeof opts.senderIsOwner !== "boolean") {
    throw new Error("senderIsOwner must be explicitly set for ingress agent runs.");
  }
  return await agentCommand(
    {
      ...opts,
      senderIsOwner: opts.senderIsOwner,
    },
    runtime,
    deps,
  );
}
