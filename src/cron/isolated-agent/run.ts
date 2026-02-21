import {
  resolveAgentConfig,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { ensureAuthProfileStore } from "../../agents/auth-profiles.js";
import { resolveSessionAuthProfileOverride } from "../../agents/auth-profiles/session-override.js";
import {
  isCliProvider,
  parseModelRef,
  resolveConfiguredModelRef,
  resolveThinkingDefault,
} from "../../agents/cli-routing.js";
import { setCliSessionId } from "../../agents/cli-session.js";
import { lookupContextTokens } from "../../agents/context.js";
import { resolveCronStyleNow } from "../../agents/current-time.js";
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { type ResolvedProviderAuth, resolveApiKeyForProvider } from "../../agents/model-auth.js";
import { runSubagentAnnounceFlow } from "../../agents/subagent-announce.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { deriveSessionTotalTokens, hasNonzeroUsage } from "../../agents/usage.js";
import { ensureAgentWorkspace } from "../../agents/workspace.js";
import {
  normalizeThinkLevel,
  normalizeVerboseLevel,
  supportsXHighThinking,
} from "../../auto-reply/thinking.js";
import { createOutboundSendDeps, type CliDeps } from "../../cli/outbound-send-deps.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveAgentMainSessionKey, updateSessionStore } from "../../config/sessions.js";
import type { AgentDefaultsConfig } from "../../config/types.js";
import { registerAgentRunContext } from "../../infra/agent-events.js";
import { deliverOutboundPayloads } from "../../infra/outbound/deliver.js";
import { logWarn } from "../../logger.js";
import { ChannelBridge, createCliRuntime, type ChannelMessage } from "../../middleware/index.js";
import { buildAgentMainSessionKey, normalizeAgentId } from "../../routing/session-key.js";
import {
  buildSafeExternalPrompt,
  detectSuspiciousPatterns,
  getHookType,
  isExternalHookSession,
} from "../../security/external-content.js";
import { resolveCronDeliveryPlan } from "../delivery.js";
import type { CronJob } from "../types.js";
import { resolveDeliveryTarget } from "./delivery-target.js";
import {
  isHeartbeatOnlyResponse,
  pickLastDeliverablePayload,
  pickLastNonEmptyTextFromPayloads,
  pickSummaryFromOutput,
  pickSummaryFromPayloads,
  resolveHeartbeatAckMaxChars,
} from "./helpers.js";
import { resolveCronSession } from "./session.js";

function resolveCronDeliveryBestEffort(job: CronJob): boolean {
  if (typeof job.delivery?.bestEffort === "boolean") {
    return job.delivery.bestEffort;
  }
  if (job.payload.kind === "agentTurn" && typeof job.payload.bestEffortDeliver === "boolean") {
    return job.payload.bestEffortDeliver;
  }
  return false;
}

export type RunCronAgentTurnResult = {
  status: "ok" | "error" | "skipped";
  summary?: string;
  /** Last non-empty agent text output (not truncated). */
  outputText?: string;
  error?: string;
  sessionId?: string;
  sessionKey?: string;
  /**
   * `true` when the isolated run already delivered its output to the target
   * channel (via outbound payloads or the subagent announce flow).  Callers
   * should skip posting a summary to the main session to avoid duplicate
   * messages.  See: https://github.com/openclaw/openclaw/issues/15692
   */
  delivered?: boolean;
};

export async function runCronIsolatedAgentTurn(params: {
  cfg: RemoteClawConfig;
  deps: CliDeps;
  job: CronJob;
  message: string;
  sessionKey: string;
  agentId?: string;
  lane?: string;
}): Promise<RunCronAgentTurnResult> {
  const isFastTestEnv = process.env.REMOTECLAW_TEST_FAST === "1";
  const defaultAgentId = resolveDefaultAgentId(params.cfg);
  const requestedAgentId =
    typeof params.agentId === "string" && params.agentId.trim()
      ? params.agentId
      : typeof params.job.agentId === "string" && params.job.agentId.trim()
        ? params.job.agentId
        : undefined;
  const normalizedRequested = requestedAgentId ? normalizeAgentId(requestedAgentId) : undefined;
  const agentConfigOverride = normalizedRequested
    ? resolveAgentConfig(params.cfg, normalizedRequested)
    : undefined;
  const { model: overrideModel, ...agentOverrideRest } = agentConfigOverride ?? {};
  // Use the requested agentId even when there is no explicit agent config entry.
  // This ensures auth-profiles, workspace, and agentDir all resolve to the
  // correct per-agent paths (e.g. ~/.remoteclaw/agents/<agentId>/agent/).
  const agentId = normalizedRequested ?? defaultAgentId;
  const agentCfg: AgentDefaultsConfig = Object.assign(
    {},
    params.cfg.agents?.defaults,
    agentOverrideRest as Partial<AgentDefaultsConfig>,
  );
  if (typeof overrideModel === "string") {
    agentCfg.model = { primary: overrideModel };
  } else if (overrideModel) {
    agentCfg.model = overrideModel;
  }
  const cfgWithAgentDefaults: RemoteClawConfig = {
    ...params.cfg,
    agents: Object.assign({}, params.cfg.agents, { defaults: agentCfg }),
  };

  const baseSessionKey = (params.sessionKey?.trim() || `cron:${params.job.id}`).trim();
  const agentSessionKey = buildAgentMainSessionKey({
    agentId,
    mainKey: baseSessionKey,
  });

  const workspaceDirRaw = resolveAgentWorkspaceDir(params.cfg, agentId);
  const workspace = await ensureAgentWorkspace({
    dir: workspaceDirRaw,
    ensureBootstrapFiles: !agentCfg?.skipBootstrap && !isFastTestEnv,
  });
  const workspaceDir = workspace.dir;

  const resolvedDefault = resolveConfiguredModelRef({
    cfg: cfgWithAgentDefaults,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  let provider = resolvedDefault.provider;
  let model = resolvedDefault.model;
  // Resolve model - prefer hooks.gmail.model for Gmail hooks.
  const isGmailHook = baseSessionKey.startsWith("hook:gmail:");
  let hooksGmailModelApplied = false;
  const hooksGmailModelRaw = isGmailHook ? params.cfg.hooks?.gmail?.model?.trim() : undefined;
  if (hooksGmailModelRaw) {
    const parsed = parseModelRef(hooksGmailModelRaw, resolvedDefault.provider);
    if (parsed) {
      provider = parsed.provider;
      model = parsed.model;
      hooksGmailModelApplied = true;
    }
  }
  const modelOverrideRaw =
    params.job.payload.kind === "agentTurn" ? params.job.payload.model : undefined;
  const modelOverride = typeof modelOverrideRaw === "string" ? modelOverrideRaw.trim() : undefined;
  if (modelOverride !== undefined && modelOverride.length > 0) {
    const parsed = parseModelRef(modelOverride, resolvedDefault.provider);
    if (!parsed) {
      return { status: "error", error: `invalid model override: ${modelOverride}` };
    }
    provider = parsed.provider;
    model = parsed.model;
  }
  const now = Date.now();
  const cronSession = resolveCronSession({
    cfg: params.cfg,
    sessionKey: agentSessionKey,
    agentId,
    nowMs: now,
  });
  const runSessionId = cronSession.sessionEntry.sessionId;
  const runSessionKey = baseSessionKey.startsWith("cron:")
    ? `${agentSessionKey}:run:${runSessionId}`
    : agentSessionKey;
  const persistSessionEntry = async () => {
    if (isFastTestEnv) {
      return;
    }
    cronSession.store[agentSessionKey] = cronSession.sessionEntry;
    if (runSessionKey !== agentSessionKey) {
      cronSession.store[runSessionKey] = cronSession.sessionEntry;
    }
    await updateSessionStore(cronSession.storePath, (store) => {
      store[agentSessionKey] = cronSession.sessionEntry;
      if (runSessionKey !== agentSessionKey) {
        store[runSessionKey] = cronSession.sessionEntry;
      }
    });
  };
  const withRunSession = (
    result: Omit<RunCronAgentTurnResult, "sessionId" | "sessionKey">,
  ): RunCronAgentTurnResult => ({
    ...result,
    sessionId: runSessionId,
    sessionKey: runSessionKey,
  });
  if (!cronSession.sessionEntry.label?.trim() && baseSessionKey.startsWith("cron:")) {
    const labelSuffix =
      typeof params.job.name === "string" && params.job.name.trim()
        ? params.job.name.trim()
        : params.job.id;
    cronSession.sessionEntry.label = `Cron: ${labelSuffix}`;
  }

  // Respect session model override -- check session.modelOverride before falling
  // back to the default config model. This ensures /model changes are honoured
  // by cron and isolated agent runs.
  if (!modelOverride && !hooksGmailModelApplied) {
    const sessionModelOverride = cronSession.sessionEntry.modelOverride?.trim();
    if (sessionModelOverride) {
      provider = cronSession.sessionEntry.providerOverride?.trim() || resolvedDefault.provider;
      model = sessionModelOverride;
    }
  }

  // Resolve thinking level - job thinking > hooks.gmail.thinking > agent default
  const hooksGmailThinking = isGmailHook
    ? normalizeThinkLevel(params.cfg.hooks?.gmail?.thinking)
    : undefined;
  const thinkOverride = normalizeThinkLevel(agentCfg?.thinkingDefault);
  const jobThink = normalizeThinkLevel(
    (params.job.payload.kind === "agentTurn" ? params.job.payload.thinking : undefined) ??
      undefined,
  );
  let thinkLevel = jobThink ?? hooksGmailThinking ?? thinkOverride;
  if (!thinkLevel) {
    thinkLevel = resolveThinkingDefault({ cfg: cfgWithAgentDefaults });
  }
  if (thinkLevel === "xhigh" && !supportsXHighThinking(provider, model)) {
    logWarn(
      `[cron:${params.job.id}] Thinking level "xhigh" is not supported for ${provider}/${model}; downgrading to "high".`,
    );
    thinkLevel = "high";
  }

  const timeoutMs = resolveAgentTimeoutMs({
    cfg: cfgWithAgentDefaults,
    overrideSeconds:
      params.job.payload.kind === "agentTurn" ? params.job.payload.timeoutSeconds : undefined,
  });

  const agentPayload = params.job.payload.kind === "agentTurn" ? params.job.payload : null;
  const deliveryPlan = resolveCronDeliveryPlan(params.job);
  const deliveryRequested = deliveryPlan.requested;

  const resolvedDelivery = await resolveDeliveryTarget(cfgWithAgentDefaults, agentId, {
    channel: deliveryPlan.channel ?? "last",
    to: deliveryPlan.to,
  });

  const { formattedTime, timeLine } = resolveCronStyleNow(params.cfg, now);
  const base = `[cron:${params.job.id} ${params.job.name}] ${params.message}`.trim();

  // SECURITY: Wrap external hook content with security boundaries to prevent prompt injection
  // unless explicitly allowed via a dangerous config override.
  const isExternalHook = isExternalHookSession(baseSessionKey);
  const allowUnsafeExternalContent =
    agentPayload?.allowUnsafeExternalContent === true ||
    (isGmailHook && params.cfg.hooks?.gmail?.allowUnsafeExternalContent === true);
  const shouldWrapExternal = isExternalHook && !allowUnsafeExternalContent;
  let commandBody: string;

  if (isExternalHook) {
    // Log suspicious patterns for security monitoring
    const suspiciousPatterns = detectSuspiciousPatterns(params.message);
    if (suspiciousPatterns.length > 0) {
      logWarn(
        `[security] Suspicious patterns detected in external hook content ` +
          `(session=${baseSessionKey}, patterns=${suspiciousPatterns.length}): ${suspiciousPatterns.slice(0, 3).join(", ")}`,
      );
    }
  }

  if (shouldWrapExternal) {
    // Wrap external content with security boundaries
    const hookType = getHookType(baseSessionKey);
    const safeContent = buildSafeExternalPrompt({
      content: params.message,
      source: hookType,
      jobName: params.job.name,
      jobId: params.job.id,
      timestamp: formattedTime,
    });

    commandBody = `${safeContent}\n\n${timeLine}`.trim();
  } else {
    // Internal/trusted source - use original format
    commandBody = `${base}\n${timeLine}`.trim();
  }
  if (deliveryRequested) {
    commandBody =
      `${commandBody}\n\nReturn your summary as plain text; it will be delivered automatically. If the task explicitly calls for messaging a specific external recipient, note who/where it should go instead of sending it yourself.`.trim();
  }

  // Persist systemSent before the run, mirroring the inbound auto-reply behavior.
  cronSession.sessionEntry.systemSent = true;
  await persistSessionEntry();

  const runStartedAt = Date.now();
  let runEndedAt = runStartedAt;
  let reply: Awaited<ReturnType<ChannelBridge["handle"]>>;
  try {
    const resolvedVerboseLevel =
      normalizeVerboseLevel(cronSession.sessionEntry.verboseLevel) ??
      normalizeVerboseLevel(agentCfg?.verboseDefault) ??
      "off";
    registerAgentRunContext(cronSession.sessionEntry.sessionId, {
      sessionKey: agentSessionKey,
      verboseLevel: resolvedVerboseLevel,
    });
    let resolvedAuth: ResolvedProviderAuth | undefined;
    const authProfileStore = ensureAuthProfileStore(workspaceDir);
    const resolvedProfileId = await resolveSessionAuthProfileOverride({
      cfg: cfgWithAgentDefaults,
      provider,
      agentDir: workspaceDir,
      sessionEntry: cronSession.sessionEntry,
      sessionStore: cronSession.store,
      sessionKey: agentSessionKey,
      storePath: cronSession.storePath,
      isNewSession: cronSession.isNewSession,
    });
    if (resolvedProfileId) {
      resolvedAuth = await resolveApiKeyForProvider({
        provider,
        cfg: cfgWithAgentDefaults,
        profileId: resolvedProfileId,
        store: authProfileStore,
        agentDir: workspaceDir,
      });
    }

    const bridge = new ChannelBridge({
      runtime: createCliRuntime(provider, cfgWithAgentDefaults),
      sessionDir: workspaceDir,
      defaultModel: model,
      defaultTimeoutMs: timeoutMs,
      auth: resolvedAuth,
    });
    const channelMessage: ChannelMessage = {
      channelId: resolvedDelivery.channel ?? "cron",
      userId: resolvedDelivery.accountId ?? "system",
      threadId: undefined,
      text: commandBody,
      workspaceDir,
    };
    reply = await bridge.handle(channelMessage);
    runEndedAt = Date.now();
  } catch (err) {
    return withRunSession({ status: "error", error: String(err) });
  }

  const payloads = reply.text ? [{ text: reply.text }] : [];

  // Update token+model fields in the session store.
  {
    const usage = reply.usage
      ? {
          input: reply.usage.inputTokens,
          output: reply.usage.outputTokens,
          cacheRead: reply.usage.cacheReadTokens,
          cacheWrite: reply.usage.cacheWriteTokens,
        }
      : undefined;
    const modelUsed = model;
    const providerUsed = provider;
    const contextTokens =
      agentCfg?.contextTokens ?? lookupContextTokens(modelUsed) ?? DEFAULT_CONTEXT_TOKENS;

    cronSession.sessionEntry.modelProvider = providerUsed;
    cronSession.sessionEntry.model = modelUsed;
    cronSession.sessionEntry.contextTokens = contextTokens;
    if (isCliProvider(providerUsed, cfgWithAgentDefaults)) {
      const cliSessionId = reply.sessionId?.trim();
      if (cliSessionId) {
        setCliSessionId(cronSession.sessionEntry, providerUsed, cliSessionId);
      }
    }
    if (hasNonzeroUsage(usage)) {
      const input = usage.input ?? 0;
      const output = usage.output ?? 0;
      cronSession.sessionEntry.inputTokens = input;
      cronSession.sessionEntry.outputTokens = output;
      cronSession.sessionEntry.totalTokens =
        deriveSessionTotalTokens({
          usage,
          contextTokens,
        }) ?? input;
    }
    await persistSessionEntry();
  }
  const firstText = payloads[0]?.text ?? "";
  const summary = pickSummaryFromPayloads(payloads) ?? pickSummaryFromOutput(firstText);
  const outputText = pickLastNonEmptyTextFromPayloads(payloads);
  const synthesizedText = outputText?.trim() || summary?.trim() || undefined;
  const deliveryPayload = pickLastDeliverablePayload(payloads);
  const deliveryPayloads =
    deliveryPayload !== undefined
      ? [deliveryPayload]
      : synthesizedText
        ? [{ text: synthesizedText }]
        : [];
  const deliveryPayloadHasStructuredContent =
    Boolean(deliveryPayload?.mediaUrl) ||
    (deliveryPayload?.mediaUrls?.length ?? 0) > 0 ||
    Object.keys(deliveryPayload?.channelData ?? {}).length > 0;
  const deliveryBestEffort = resolveCronDeliveryBestEffort(params.job);

  // Skip delivery for heartbeat-only responses (HEARTBEAT_OK with no real content).
  const ackMaxChars = resolveHeartbeatAckMaxChars(agentCfg);
  const skipHeartbeatDelivery = deliveryRequested && isHeartbeatOnlyResponse(payloads, ackMaxChars);
  // ChannelBridge does not support messaging tools; always false.
  const skipMessagingToolDelivery = false;

  let delivered = false;
  if (deliveryRequested && !skipHeartbeatDelivery && !skipMessagingToolDelivery) {
    if (resolvedDelivery.error) {
      if (!deliveryBestEffort) {
        return withRunSession({
          status: "error",
          error: resolvedDelivery.error.message,
          summary,
          outputText,
        });
      }
      logWarn(`[cron:${params.job.id}] ${resolvedDelivery.error.message}`);
      return withRunSession({ status: "ok", summary, outputText });
    }
    if (!resolvedDelivery.to) {
      const message = "cron delivery target is missing";
      if (!deliveryBestEffort) {
        return withRunSession({
          status: "error",
          error: message,
          summary,
          outputText,
        });
      }
      logWarn(`[cron:${params.job.id}] ${message}`);
      return withRunSession({ status: "ok", summary, outputText });
    }
    // Shared subagent announce flow is text-based; keep direct outbound delivery
    // for media/channel payloads so structured content is preserved.
    if (deliveryPayloadHasStructuredContent) {
      try {
        await deliverOutboundPayloads({
          cfg: cfgWithAgentDefaults,
          channel: resolvedDelivery.channel,
          to: resolvedDelivery.to,
          accountId: resolvedDelivery.accountId,
          threadId: resolvedDelivery.threadId,
          payloads: deliveryPayloads,
          bestEffort: deliveryBestEffort,
          deps: createOutboundSendDeps(params.deps),
        });
        delivered = true;
      } catch (err) {
        if (!deliveryBestEffort) {
          return withRunSession({ status: "error", summary, outputText, error: String(err) });
        }
      }
    } else if (synthesizedText) {
      const announceSessionKey = resolveAgentMainSessionKey({
        cfg: params.cfg,
        agentId,
      });
      const taskLabel =
        typeof params.job.name === "string" && params.job.name.trim()
          ? params.job.name.trim()
          : `cron:${params.job.id}`;
      try {
        const didAnnounce = await runSubagentAnnounceFlow({
          childSessionKey: runSessionKey,
          childRunId: `${params.job.id}:${runSessionId}`,
          requesterSessionKey: announceSessionKey,
          requesterOrigin: {
            channel: resolvedDelivery.channel,
            to: resolvedDelivery.to,
            accountId: resolvedDelivery.accountId,
            threadId: resolvedDelivery.threadId,
          },
          requesterDisplayKey: announceSessionKey,
          task: taskLabel,
          timeoutMs,
          cleanup: params.job.deleteAfterRun ? "delete" : "keep",
          roundOneReply: synthesizedText,
          waitForCompletion: false,
          startedAt: runStartedAt,
          endedAt: runEndedAt,
          outcome: { status: "ok" },
          announceType: "cron job",
        });
        if (didAnnounce) {
          delivered = true;
        } else {
          const message = "cron announce delivery failed";
          if (!deliveryBestEffort) {
            return withRunSession({
              status: "error",
              summary,
              outputText,
              error: message,
            });
          }
          logWarn(`[cron:${params.job.id}] ${message}`);
        }
      } catch (err) {
        if (!deliveryBestEffort) {
          return withRunSession({ status: "error", summary, outputText, error: String(err) });
        }
        logWarn(`[cron:${params.job.id}] ${String(err)}`);
      }
    }
  }

  return withRunSession({ status: "ok", summary, outputText, delivered });
}
