import crypto from "node:crypto";
import {
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { resolveSessionAuthProfileOverride } from "../../agents/auth-profiles/session-override.js";
import { resolveChannelMessageToolHints } from "../../agents/channel-tools.js";
import { getCliSessionId, setCliSessionId } from "../../agents/cli-session.js";
import { resolveCronStyleNow } from "../../agents/current-time.js";
import { resolveUserTimezone } from "../../agents/date-time.js";
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { isCliProvider, normalizeModelRef, parseModelRef } from "../../agents/provider-utils.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { deriveSessionTotalTokens, hasNonzeroUsage } from "../../agents/usage.js";
import { ensureAgentWorkspace } from "../../agents/workspace.js";
import { normalizeVerboseLevel } from "../../auto-reply/thinking.js";
import type { CliDeps } from "../../cli/outbound-send-deps.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveGatewayPort } from "../../config/paths.js";
import { setSessionRuntimeModel, updateSessionStore } from "../../config/sessions.js";
import type { AgentDefaultsConfig } from "../../config/types.js";
import { resolveGatewayCredentialsFromConfig } from "../../gateway/credentials.js";
import { registerAgentRunContext } from "../../infra/agent-events.js";
import { logWarn } from "../../logger.js";
import { ChannelBridge } from "../../middleware/channel-bridge.js";
import type { SessionMap } from "../../middleware/session-map.js";
import type { AgentDeliveryResult, ChannelMessage } from "../../middleware/types.js";
import { buildAgentMainSessionKey, normalizeAgentId } from "../../routing/session-key.js";
import {
  buildSafeExternalPrompt,
  detectSuspiciousPatterns,
  getHookType,
  isExternalHookSession,
} from "../../security/external-content.js";
import { resolveCronDeliveryPlan } from "../delivery.js";
import type { CronJob, CronRunOutcome, CronRunTelemetry } from "../types.js";
import {
  dispatchCronDelivery,
  matchesMessagingToolDeliveryTarget,
  resolveCronDeliveryBestEffort,
} from "./delivery-dispatch.js";
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

// ── ChannelBridge helpers ───────────────────────────────────────────────

/**
 * Create a SessionMap-compatible adapter that bridges the cron session
 * store to the ChannelBridge's SessionMap interface.
 *
 * `get()` returns the CLI session ID from the cron session entry.
 * `set()` is a no-op — session updates are handled by the caller after the run.
 */
function createSessionMapAdapter(params: { getSessionId: () => string | undefined }): SessionMap {
  return {
    async get() {
      return params.getSessionId();
    },
    async set() {
      // Session updates handled by caller (persistSessionEntry / setCliSessionId)
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

/** Build a ChannelMessage from the cron job context. */
function buildCronChannelMessage(params: {
  job: CronJob;
  commandBody: string;
  resolvedDelivery: { channel?: string; to?: string; accountId?: string };
  timestamp: number;
  messageToolHints: string[] | undefined;
  agentId?: string;
  timezone?: string;
  authorizedSenders?: string[];
}): ChannelMessage {
  return {
    id: params.job.id ?? crypto.randomUUID(),
    text: params.commandBody,
    from: params.resolvedDelivery.accountId ?? "system",
    replyToId: `cron:${params.job.id}`,
    channelId: params.resolvedDelivery.to ?? "",
    provider: params.resolvedDelivery.channel ?? "cron",
    timestamp: params.timestamp,
    messageToolHints: params.messageToolHints?.length ? params.messageToolHints : undefined,
    senderIsOwner: false, // Cron agents must not self-modify via owner-only tools
    agentId: params.agentId || undefined,
    timezone: params.timezone || undefined,
    authorizedSenders: params.authorizedSenders?.length ? params.authorizedSenders : undefined,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

export type RunCronAgentTurnResult = {
  /** Last non-empty agent text output (not truncated). */
  outputText?: string;
  /**
   * `true` when the isolated run already delivered its output to the target
   * channel (via outbound payloads, the subagent announce flow, or a matching
   * messaging-tool send). Callers should skip posting a summary to the main
   * session to avoid duplicate
   * messages.  See: https://github.com/openclaw/openclaw/issues/15692
   */
  delivered?: boolean;
} & CronRunOutcome &
  CronRunTelemetry;

export async function runCronIsolatedAgentTurn(params: {
  cfg: RemoteClawConfig;
  deps: CliDeps;
  job: CronJob;
  message: string;
  abortSignal?: AbortSignal;
  signal?: AbortSignal;
  sessionKey: string;
  agentId?: string;
  lane?: string;
}): Promise<RunCronAgentTurnResult> {
  const abortSignal = params.abortSignal ?? params.signal;
  const isAborted = () => abortSignal?.aborted === true;
  const abortReason = () => {
    const reason = abortSignal?.reason;
    return typeof reason === "string" && reason.trim()
      ? reason.trim()
      : "cron: job execution timed out";
  };
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
  // correct per-agent paths (e.g. ~/.openclaw/agents/<agentId>/agent/).
  const agentId = normalizedRequested ?? defaultAgentId;
  const agentCfg: AgentDefaultsConfig = Object.assign(
    {},
    params.cfg.agents?.defaults,
    agentOverrideRest as Partial<AgentDefaultsConfig>,
  );
  // Merge agent model override with defaults instead of replacing, so that
  // `fallbacks` from `agents.defaults.model` are preserved when the agent
  // (or its per-cron model pin) only specifies `primary`.
  const existingModel = agentCfg.model && typeof agentCfg.model === "object" ? agentCfg.model : {};
  if (typeof overrideModel === "string") {
    agentCfg.model = { ...existingModel, primary: overrideModel };
  } else if (overrideModel) {
    agentCfg.model = { ...existingModel, ...overrideModel };
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
  const agentDir = resolveAgentDir(params.cfg, agentId);
  const workspace = await ensureAgentWorkspace({
    dir: workspaceDirRaw,
    ensureBootstrapFiles: !agentCfg?.skipBootstrap && !isFastTestEnv,
  });
  const workspaceDir = workspace.dir;

  const resolvedDefault = normalizeModelRef(DEFAULT_PROVIDER, DEFAULT_MODEL);
  let provider = resolvedDefault.provider;
  let model = resolvedDefault.model;
  const modelOverrideRaw =
    params.job.payload.kind === "agentTurn" ? params.job.payload.model : undefined;
  const modelOverride = typeof modelOverrideRaw === "string" ? modelOverrideRaw.trim() : undefined;
  if (modelOverride !== undefined && modelOverride.length > 0) {
    const parsed = parseModelRef(modelOverride, resolvedDefault.provider);
    if (!parsed) {
      return { status: "error", error: `Unrecognized model "${modelOverride}".` };
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
    // Isolated cron runs must not carry prior turn context across executions.
    forceNew: params.job.sessionTarget === "isolated",
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

  // Respect session model override — check session.modelOverride before falling
  // back to the default config model. This ensures /model changes are honoured
  // by cron and isolated agent runs.
  if (!modelOverride) {
    const sessionModelOverride = cronSession.sessionEntry.modelOverride?.trim();
    if (sessionModelOverride) {
      const sessionProviderOverride =
        cronSession.sessionEntry.providerOverride?.trim() || resolvedDefault.provider;
      const parsed = parseModelRef(
        `${sessionProviderOverride}/${sessionModelOverride}`,
        resolvedDefault.provider,
      );
      if (parsed) {
        provider = parsed.provider;
        model = parsed.model;
      }
    }
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
    sessionKey: params.job.sessionKey,
  });

  const { formattedTime, timeLine } = resolveCronStyleNow(params.cfg, now);
  const base = `[cron:${params.job.id} ${params.job.name}] ${params.message}`.trim();

  // SECURITY: Wrap external hook content with security boundaries to prevent prompt injection
  // unless explicitly allowed via a dangerous config override.
  const isGmailHook = baseSessionKey.startsWith("hook:gmail:");
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

  // Resolve auth profile for the session, mirroring the inbound auto-reply path
  // (get-reply-run.ts). Without this, isolated cron sessions fall back to env-var
  // auth which may not match the configured auth-profiles, causing 401 errors.
  // Resolve auth profile for the session (side effect: updates cronSession.sessionEntry).
  await resolveSessionAuthProfileOverride({
    cfg: cfgWithAgentDefaults,
    provider,
    agentDir,
    sessionEntry: cronSession.sessionEntry,
    sessionStore: cronSession.store,
    sessionKey: agentSessionKey,
    storePath: cronSession.storePath,
    isNewSession: cronSession.isNewSession,
  });

  let runResult: AgentDeliveryResult;
  const fallbackProvider = provider;
  const fallbackModel = model;
  const runStartedAt = Date.now();
  let runEndedAt = runStartedAt;
  try {
    const resolvedVerboseLevel =
      normalizeVerboseLevel(cronSession.sessionEntry.verboseLevel) ??
      normalizeVerboseLevel(agentCfg?.verboseDefault) ??
      "off";
    registerAgentRunContext(cronSession.sessionEntry.sessionId, {
      sessionKey: agentSessionKey,
      verboseLevel: resolvedVerboseLevel,
    });

    if (abortSignal?.aborted) {
      throw new Error(abortReason());
    }

    const sessionMap = createSessionMapAdapter({
      getSessionId: () => getCliSessionId(cronSession.sessionEntry, provider),
    });

    const bridge = new ChannelBridge({
      provider,
      sessionMap,
      gatewayUrl: resolveGatewayUrlFromConfig(cfgWithAgentDefaults),
      gatewayToken: resolveGatewayTokenFromConfig(cfgWithAgentDefaults),
      workspaceDir,
    });

    const messageToolHints = resolveChannelMessageToolHints({
      cfg: cfgWithAgentDefaults,
      channel: resolvedDelivery.channel,
      accountId: resolvedDelivery.accountId,
    });

    const message = buildCronChannelMessage({
      job: params.job,
      commandBody,
      resolvedDelivery,
      timestamp: now,
      messageToolHints,
      agentId,
      timezone: resolveUserTimezone(cfgWithAgentDefaults.agents?.defaults?.userTimezone),
    });

    runResult = await bridge.handle(message, undefined, abortSignal);
    runEndedAt = Date.now();
  } catch (err) {
    return withRunSession({ status: "error", error: String(err) });
  }

  if (isAborted()) {
    return withRunSession({ status: "error", error: abortReason() });
  }

  const payloads = runResult.payloads ?? [];

  // Update token+model fields in the session store.
  // Also collect best-effort telemetry for the cron run log.
  let telemetry: CronRunTelemetry | undefined;
  {
    const runUsage = runResult.run.usage;
    // Map AgentUsage to NormalizedUsage shape expected by usage helpers
    const usage = runUsage
      ? {
          input: runUsage.inputTokens,
          output: runUsage.outputTokens,
          cacheRead: runUsage.cacheReadTokens,
          cacheWrite: runUsage.cacheWriteTokens,
        }
      : undefined;
    const modelUsed = fallbackModel ?? model;
    const providerUsed = fallbackProvider ?? provider;
    const contextTokens = agentCfg?.contextTokens ?? DEFAULT_CONTEXT_TOKENS;

    setSessionRuntimeModel(cronSession.sessionEntry, {
      provider: providerUsed,
      model: modelUsed,
    });
    cronSession.sessionEntry.contextTokens = contextTokens;
    if (isCliProvider(providerUsed, cfgWithAgentDefaults)) {
      const cliSessionId = runResult.run.sessionId?.trim();
      if (cliSessionId) {
        setCliSessionId(cronSession.sessionEntry, providerUsed, cliSessionId);
      }
    }
    if (hasNonzeroUsage(usage)) {
      const input = usage.input ?? 0;
      const output = usage.output ?? 0;
      const totalTokens =
        deriveSessionTotalTokens({
          usage,
          contextTokens,
        }) ?? input;
      cronSession.sessionEntry.inputTokens = input;
      cronSession.sessionEntry.outputTokens = output;
      cronSession.sessionEntry.totalTokens = totalTokens;
      cronSession.sessionEntry.totalTokensFresh = true;
      cronSession.sessionEntry.cacheRead = usage.cacheRead ?? 0;
      cronSession.sessionEntry.cacheWrite = usage.cacheWrite ?? 0;

      telemetry = {
        model: modelUsed,
        provider: providerUsed,
        usage: {
          input_tokens: input,
          output_tokens: output,
          total_tokens: totalTokens,
        },
      };
    } else {
      telemetry = {
        model: modelUsed,
        provider: providerUsed,
      };
    }
    await persistSessionEntry();
  }

  if (isAborted()) {
    return withRunSession({ status: "error", error: abortReason(), ...telemetry });
  }
  const firstText = payloads[0]?.text ?? "";
  let summary = pickSummaryFromPayloads(payloads) ?? pickSummaryFromOutput(firstText);
  let outputText = pickLastNonEmptyTextFromPayloads(payloads);
  let synthesizedText = outputText?.trim() || summary?.trim() || undefined;
  const deliveryPayload = pickLastDeliverablePayload(payloads);
  let deliveryPayloads =
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
  const hasErrorPayload = payloads.some((payload) => payload?.isError === true);
  const lastErrorPayloadText = [...payloads]
    .toReversed()
    .find((payload) => payload?.isError === true && Boolean(payload?.text?.trim()))
    ?.text?.trim();
  const embeddedRunError = hasErrorPayload
    ? (lastErrorPayloadText ?? "cron isolated run returned an error payload")
    : undefined;
  const resolveRunOutcome = (params?: { delivered?: boolean }) =>
    withRunSession({
      status: hasErrorPayload ? "error" : "ok",
      ...(hasErrorPayload
        ? { error: embeddedRunError ?? "cron isolated run returned an error payload" }
        : {}),
      summary,
      outputText,
      delivered: params?.delivered,
      ...telemetry,
    });

  // Skip delivery for heartbeat-only responses (HEARTBEAT_OK with no real content).
  const ackMaxChars = resolveHeartbeatAckMaxChars(agentCfg);
  const skipHeartbeatDelivery = deliveryRequested && isHeartbeatOnlyResponse(payloads, ackMaxChars);
  const didSendViaMessagingTool =
    runResult.mcp.sentTexts.length > 0 || runResult.mcp.sentMediaUrls.length > 0;
  const skipMessagingToolDelivery =
    deliveryRequested &&
    didSendViaMessagingTool &&
    runResult.mcp.sentTargets.some((target) =>
      matchesMessagingToolDeliveryTarget(target, {
        channel: resolvedDelivery.channel,
        to: resolvedDelivery.to,
        accountId: resolvedDelivery.accountId,
      }),
    );

  const deliveryResult = await dispatchCronDelivery({
    cfg: params.cfg,
    cfgWithAgentDefaults,
    deps: params.deps,
    job: params.job,
    agentId,
    agentSessionKey,
    runSessionId,
    runStartedAt,
    runEndedAt,
    timeoutMs,
    resolvedDelivery,
    deliveryRequested,
    skipHeartbeatDelivery,
    skipMessagingToolDelivery,
    deliveryBestEffort,
    deliveryPayloadHasStructuredContent,
    deliveryPayloads,
    synthesizedText,
    summary,
    outputText,
    telemetry,
    abortSignal,
    isAborted,
    abortReason,
    withRunSession,
  });
  if (deliveryResult.result) {
    if (!hasErrorPayload || deliveryResult.result.status !== "ok") {
      return deliveryResult.result;
    }
    return resolveRunOutcome({ delivered: deliveryResult.result.delivered });
  }
  const delivered = deliveryResult.delivered;
  summary = deliveryResult.summary;
  outputText = deliveryResult.outputText;

  return resolveRunOutcome({ delivered });
}
