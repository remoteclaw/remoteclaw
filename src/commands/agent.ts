import {
  listAgentIds,
  resolveAgentModelPrimary,
  resolveAgentWorkspaceDir,
} from "../agents/agent-scope.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { resolveSessionAuthProfileOverride } from "../agents/auth-profiles/session-override.js";
import { markAuthProfileFailure, markAuthProfileUsed } from "../agents/auth-profiles/usage.js";
import { resolveConfiguredModelRef, resolveThinkingDefault } from "../agents/cli-routing.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { type ResolvedProviderAuth, resolveApiKeyForProvider } from "../agents/model-auth.js";
import { resolveAgentTimeoutMs } from "../agents/timeout.js";
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
import { loadConfig } from "../config/config.js";
import {
  resolveAgentIdFromSessionKey,
  type SessionEntry,
  updateSessionStore,
} from "../config/sessions.js";
import {
  clearAgentRunContext,
  emitAgentEvent,
  registerAgentRunContext,
} from "../infra/agent-events.js";
import {
  type BridgeCallbacks,
  ChannelBridge,
  type ChannelMessage,
  createCliRuntime,
} from "../middleware/index.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { applyVerboseOverride } from "../sessions/level-overrides.js";
import { resolveSendPolicy } from "../sessions/send-policy.js";
import { deliverAgentCommandResult } from "./agent/delivery.js";
import { resolveAgentRunContext } from "./agent/run-context.js";
import { updateSessionStoreAfterAgentRun } from "./agent/session-store.js";
import { resolveSession } from "./agent/session.js";
import type { AgentCommandOpts } from "./agent/types.js";

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
  const sessionAgentId = agentIdOverride ?? resolveAgentIdFromSessionKey(opts.sessionKey?.trim());
  const workspaceDirRaw = resolveAgentWorkspaceDir(cfg, sessionAgentId);
  const workspace = await ensureAgentWorkspace({
    dir: workspaceDirRaw,
    ensureBootstrapFiles: !agentCfg?.skipBootstrap,
  });
  const workspaceDir = workspace.dir;
  const configuredModel = resolveConfiguredModelRef({
    cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const thinkingLevelsHint = formatThinkingLevels(configuredModel.provider, configuredModel.model);

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

  const timeoutSecondsRaw =
    opts.timeout !== undefined ? Number.parseInt(String(opts.timeout), 10) : undefined;
  if (
    timeoutSecondsRaw !== undefined &&
    (Number.isNaN(timeoutSecondsRaw) || timeoutSecondsRaw <= 0)
  ) {
    throw new Error("--timeout must be a positive integer (seconds)");
  }
  const timeoutMs = resolveAgentTimeoutMs({
    cfg,
    overrideSeconds: timeoutSecondsRaw,
  });

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
    isNewSession,
    persistedThinking,
    persistedVerbose,
  } = sessionResolution;
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
      sessionStore[sessionKey] = next;
      await updateSessionStore(storePath, (store) => {
        store[sessionKey] = next;
      });
    }

    const agentModelPrimary = resolveAgentModelPrimary(cfg, sessionAgentId);
    const cfgForModelSelection = agentModelPrimary
      ? {
          ...cfg,
          agents: {
            ...cfg.agents,
            defaults: {
              ...cfg.agents?.defaults,
              model: {
                ...(typeof cfg.agents?.defaults?.model === "object"
                  ? cfg.agents.defaults.model
                  : undefined),
                primary: agentModelPrimary,
              },
            },
          },
        }
      : cfg;

    const { provider: defaultProvider, model: defaultModel } = resolveConfiguredModelRef({
      cfg: cfgForModelSelection,
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: DEFAULT_MODEL,
    });
    let provider = defaultProvider;
    let model = defaultModel;

    const storedProviderOverride = sessionEntry?.providerOverride?.trim();
    const storedModelOverride = sessionEntry?.modelOverride?.trim();
    if (storedModelOverride) {
      provider = storedProviderOverride || defaultProvider;
      model = storedModelOverride;
    }
    // Resolve auth-profile credentials for the provider
    let resolvedAuth: ResolvedProviderAuth | undefined;
    const authProfileStore = ensureAuthProfileStore(workspaceDir);
    const resolvedProfileId = await resolveSessionAuthProfileOverride({
      cfg,
      provider,
      agentDir: workspaceDir,
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      isNewSession,
    });
    if (resolvedProfileId) {
      resolvedAuth = await resolveApiKeyForProvider({
        provider,
        cfg,
        profileId: resolvedProfileId,
        store: authProfileStore,
        agentDir: workspaceDir,
      });
    }

    if (!resolvedThinkLevel) {
      resolvedThinkLevel = resolveThinkingDefault({ cfg });
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
        sessionStore[sessionKey] = entry;
        await updateSessionStore(storePath, (store) => {
          store[sessionKey] = entry;
        });
      }
    }
    const startedAt = Date.now();

    let reply: Awaited<ReturnType<ChannelBridge["handle"]>>;
    try {
      const runContext = resolveAgentRunContext(opts);
      const bridge = new ChannelBridge({
        runtime: createCliRuntime(provider, cfg),
        sessionDir: workspaceDir,
        defaultModel: model,
        defaultTimeoutMs: timeoutMs,
        auth: resolvedAuth,
      });
      const channelMessage: ChannelMessage = {
        channelId: runContext.currentChannelId ?? opts.channel ?? "cli",
        userId: runContext.accountId ?? opts.accountId ?? "owner",
        threadId: opts.threadId?.toString(),
        text: body,
        workspaceDir,
      };
      const isVerbose = resolvedVerboseLevel === "on" || resolvedVerboseLevel === "full";
      const callbacks: BridgeCallbacks = {
        onPartialText: (text) => {
          process.stdout.write(text);
        },
        onToolUse: isVerbose
          ? (toolName) => {
              process.stderr.write(`[tool] ${toolName}\n`);
            }
          : undefined,
        onError: (message) => {
          process.stderr.write(`[error] ${message}\n`);
        },
      };
      reply = await bridge.handle(channelMessage, callbacks, opts.abortSignal);
      emitAgentEvent({
        runId,
        stream: "lifecycle",
        data: {
          phase: "end",
          startedAt,
          endedAt: Date.now(),
          aborted: reply.aborted,
        },
      });
      if (resolvedAuth?.profileId) {
        await markAuthProfileUsed({
          store: authProfileStore,
          profileId: resolvedAuth.profileId,
          agentDir: workspaceDir,
        });
      }
    } catch (err) {
      if (resolvedAuth?.profileId) {
        await markAuthProfileFailure({
          store: authProfileStore,
          profileId: resolvedAuth.profileId,
          reason: "unknown",
          cfg,
          agentDir: workspaceDir,
        });
      }
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

    // Build result envelope for downstream consumers (session store, delivery).
    const result = {
      payloads: reply.text ? [{ text: reply.text }] : undefined,
      meta: {
        durationMs: reply.durationMs,
        agentMeta: {
          sessionId: reply.sessionId ?? "",
          provider,
          model,
          usage: reply.usage
            ? {
                input: reply.usage.inputTokens,
                output: reply.usage.outputTokens,
                cacheRead: reply.usage.cacheReadTokens,
                cacheWrite: reply.usage.cacheWriteTokens,
              }
            : undefined,
        },
        aborted: reply.aborted || undefined,
      },
    };

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
        result,
      });
    }

    const payloads = reply.text ? [{ text: reply.text }] : [];
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
