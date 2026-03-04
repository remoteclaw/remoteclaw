import {
  listAgentIds,
  resolveSessionAgentId,
  resolveAgentWorkspaceDir,
} from "../agents/agent-scope.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { clearSessionAuthProfileOverride } from "../agents/auth-profiles/session-override.js";
import { resolveChannelMessageToolHints } from "../agents/channel-tools.js";
import { getCliSessionId } from "../agents/cli-session.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { normalizeModelRef } from "../agents/provider-utils.js";
import { ensureAgentWorkspace } from "../agents/workspace.js";
import {
  formatThinkingLevels,
  formatXHighModelHint,
  normalizeThinkLevel,
  normalizeVerboseLevel,
  supportsXHighThinking,
  type ThinkLevel,
  type VerboseLevel,
} from "../auto-reply/thinking.js";
import { formatCliCommand } from "../cli/command-format.js";
import { type CliDeps, createDefaultDeps } from "../cli/deps.js";
import { type RemoteClawConfig, loadConfig } from "../config/config.js";
import { resolveGatewayPort } from "../config/paths.js";
import {
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
import type { AgentCommandOpts } from "./agent/types.js";

type PersistSessionEntryParams = {
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath: string;
  entry: SessionEntry;
};

async function persistSessionEntry(params: PersistSessionEntryParams): Promise<void> {
  params.sessionStore[params.sessionKey] = params.entry;
  await updateSessionStore(params.storePath, (store) => {
    store[params.sessionKey] = params.entry;
  });
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
  const thinkingLevelsHint = formatThinkingLevels(DEFAULT_PROVIDER, DEFAULT_MODEL);

  const thinkOverride = normalizeThinkLevel(opts.thinking);
  const thinkOnce = normalizeThinkLevel(opts.thinkingOnce);
  if (opts.thinking && !thinkOverride) {
    throw new Error(`Invalid thinking level. Use one of: ${thinkingLevelsHint}.`);
  }
  if (opts.thinkingOnce && !thinkOnce) {
    throw new Error(`Invalid one-shot thinking level. Use one of: ${thinkingLevelsHint}.`);
  }

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
    persistedThinking,
    persistedVerbose,
  } = sessionResolution;
  const sessionAgentId =
    agentIdOverride ??
    resolveSessionAgentId({
      sessionKey: sessionKey ?? opts.sessionKey?.trim(),
      config: cfg,
    });
  const workspaceDirRaw = resolveAgentWorkspaceDir(cfg, sessionAgentId);
  const workspace = await ensureAgentWorkspace({
    dir: workspaceDirRaw,
    ensureBootstrapFiles: !agentCfg?.skipBootstrap,
  });
  const workspaceDir = workspace.dir;
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

    let resolvedThinkLevel =
      thinkOnce ??
      thinkOverride ??
      persistedThinking ??
      (agentCfg?.thinkingDefault as ThinkLevel | undefined);
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
      if (thinkOverride) {
        next.thinkingLevel = thinkOverride;
      }
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
      DEFAULT_PROVIDER,
      DEFAULT_MODEL,
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
    if (sessionEntry) {
      const authProfileId = sessionEntry.authProfileOverride;
      if (authProfileId) {
        const entry = sessionEntry;
        const store = ensureAuthProfileStore();
        const profile = store.profiles[authProfileId];
        if (!profile || profile.provider !== provider) {
          if (sessionStore && sessionKey) {
            await clearSessionAuthProfileOverride({
              sessionEntry: entry,
              sessionStore,
              sessionKey,
              storePath,
            });
          }
        }
      }
    }

    if (!resolvedThinkLevel) {
      resolvedThinkLevel = (agentCfg?.thinkingDefault as ThinkLevel | undefined) ?? undefined;
    }
    if (resolvedThinkLevel === "xhigh" && !supportsXHighThinking(provider, model)) {
      const explicitThink = Boolean(thinkOnce || thinkOverride);
      if (explicitThink) {
        throw new Error(`Thinking level "xhigh" is only supported for ${formatXHighModelHint()}.`);
      }
      resolvedThinkLevel = "high";
      if (sessionEntry && sessionStore && sessionKey && sessionEntry.thinkingLevel === "xhigh") {
        const entry = sessionEntry;
        entry.thinkingLevel = "high";
        entry.updatedAt = Date.now();
        await persistSessionEntry({
          sessionStore,
          sessionKey,
          storePath,
          entry,
        });
      }
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

    let result: AgentDeliveryResult;
    const fallbackProvider = provider;
    const fallbackModel = model;
    try {
      const runContext = resolveAgentRunContext(opts);
      const messageChannel = resolveMessageChannel(
        runContext.messageChannel,
        opts.replyChannel ?? opts.channel,
      );

      const sessionMap = createSessionMapAdapter({
        getSessionId: () => getCliSessionId(sessionEntry, provider),
      });

      const bridge = new ChannelBridge({
        provider,
        sessionMap,
        gatewayUrl: resolveGatewayUrlFromConfig(cfg),
        gatewayToken: resolveGatewayTokenFromConfig(cfg),
        workspaceDir,
      });

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

      result = await bridge.handle(message, undefined, opts.abortSignal);
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
        contextTokensOverride: agentCfg?.contextTokens,
        sessionId,
        sessionKey,
        storePath,
        sessionStore,
        defaultProvider: provider,
        defaultModel: model,
        fallbackProvider,
        fallbackModel,
        result,
      });
    }

    const payloads = result.payloads ?? [];
    return await deliverAgentCommandResult({
      cfg,
      deps,
      runtime,
      opts,
      sessionEntry,
      result,
      payloads,
    });
  } finally {
    clearAgentRunContext(runId);
  }
}
