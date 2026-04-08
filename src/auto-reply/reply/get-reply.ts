import {
  resolveAgentDir,
  resolveAgentRuntime,
  resolveAgentWorkspaceDir,
  resolveSessionAgentId,
} from "../../agents/agent-scope.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { ensureAgentWorkspace } from "../../agents/workspace.js";
import { type RemoteClawConfig, loadConfig } from "../../config/config.js";
import { defaultRuntime } from "../../runtime.js";
import { resolveCommandAuthorization } from "../command-auth.js";
import type { MsgContext } from "../templating.js";
import { SILENT_REPLY_TOKEN } from "../tokens.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { emitResetCommandHooks, type ResetCommandAction } from "./commands-core.js";
import { resolveReplyDirectives } from "./get-reply-directives.js";
import { handleInlineActions } from "./get-reply-inline-actions.js";
import { runPreparedReply } from "./get-reply-run.js";
import { finalizeInboundContext } from "./inbound-context.js";
import { initSessionState } from "./session.js";
import { createTypingController } from "./typing.js";

export async function getReplyFromConfig(
  ctx: MsgContext,
  opts?: GetReplyOptions,
  configOverride?: RemoteClawConfig,
): Promise<ReplyPayload | ReplyPayload[] | undefined> {
  const cfg = configOverride ?? loadConfig();
  const targetSessionKey =
    ctx.CommandSource === "native" ? ctx.CommandTargetSessionKey?.trim() : undefined;
  const agentSessionKey = targetSessionKey || ctx.SessionKey;
  const agentId = resolveSessionAgentId({
    sessionKey: agentSessionKey,
    config: cfg,
  });
  const agentCfg = cfg.agents?.defaults;
  const sessionCfg = cfg.session;
  // Model selection/alias infrastructure gutted in RemoteClaw — CLIs own model selection.
  // The runtime name is the single identifier that flows through to session usage.
  const runtimeId = resolveAgentRuntime(cfg, agentId) ?? "unknown";

  const workspaceDirRaw = resolveAgentWorkspaceDir(cfg, agentId);
  const workspaceDir = await ensureAgentWorkspace(workspaceDirRaw);
  const agentDir = resolveAgentDir(cfg, agentId);
  const timeoutMs = resolveAgentTimeoutMs({ cfg, overrideSeconds: opts?.timeoutOverrideSeconds });
  const configuredTypingSeconds =
    agentCfg?.typingIntervalSeconds ?? sessionCfg?.typingIntervalSeconds;
  const typingIntervalSeconds =
    typeof configuredTypingSeconds === "number" ? configuredTypingSeconds : 6;
  const typing = createTypingController({
    onReplyStart: opts?.onReplyStart,
    onCleanup: opts?.onTypingCleanup,
    typingIntervalSeconds,
    silentToken: SILENT_REPLY_TOKEN,
    log: defaultRuntime.log,
  });
  opts?.onTypingController?.(typing);

  const finalized = finalizeInboundContext(ctx);

  const commandAuthorized = finalized.CommandAuthorized;
  resolveCommandAuthorization({
    ctx: finalized,
    cfg,
    commandAuthorized,
  });
  const sessionState = await initSessionState({
    ctx: finalized,
    cfg,
    commandAuthorized,
  });
  let {
    sessionCtx,
    sessionEntry,
    previousSessionEntry,
    sessionStore,
    sessionKey,
    sessionId,
    isNewSession,
    resetTriggered,
    systemSent,
    abortedLastRun,
    storePath,
    sessionScope,
    groupResolution,
    isGroup,
    triggerBodyNormalized,
  } = sessionState;

  // Session-reset model override removed (model catalog gutted in RemoteClaw).
  // Channel model override removed — CLI runtimes own model selection.

  const directiveResult = await resolveReplyDirectives({
    ctx: finalized,
    cfg,
    agentId,
    // @ts-expect-error — upstream feature not available in RemoteClaw fork
    workspaceDir,
    agentCfg,
    sessionCtx,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    sessionScope,
    groupResolution,
    isGroup,
    triggerBodyNormalized,
    commandAuthorized,
    runtimeId,
    typing,
    opts,
  });
  if (directiveResult.kind === "reply") {
    return directiveResult.reply;
  }

  let {
    commandSource,
    command,
    allowTextCommands,
    directives,
    cleanedBody,
    defaultActivation,
    resolvedVerboseLevel,
    blockStreamingEnabled,
    blockReplyChunking,
    resolvedBlockStreamingBreak,
    provider,
    model,
    modelState: _modelState,
    contextTokens,
    inlineStatusRequested,
    directiveAck,
    perMessageQueueMode,
    perMessageQueueOptions,
  } = directiveResult.result;

  const maybeEmitMissingResetHooks = async () => {
    if (!resetTriggered || !command.isAuthorizedSender || command.resetHookTriggered) {
      return;
    }
    const resetMatch = command.commandBodyNormalized.match(/^\/(new|reset)(?:\s|$)/);
    if (!resetMatch) {
      return;
    }
    const action: ResetCommandAction = resetMatch[1] === "reset" ? "reset" : "new";
    await emitResetCommandHooks({
      action,
      ctx,
      cfg,
      command,
      sessionKey,
      sessionEntry,
      previousSessionEntry,
      // @ts-expect-error — upstream feature not available in RemoteClaw fork
      workspaceDir,
    });
  };

  const inlineActionResult = await handleInlineActions({
    ctx,
    sessionCtx,
    cfg,
    agentId,
    agentDir,
    sessionEntry,
    previousSessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    sessionScope,
    // @ts-expect-error — upstream feature not available in RemoteClaw fork
    workspaceDir,
    isGroup,
    opts,
    typing,
    allowTextCommands,
    inlineStatusRequested,
    command,
    directives,
    cleanedBody,
    defaultActivation: () => defaultActivation,
    resolvedVerboseLevel,
    provider,
    model,
    contextTokens,
    directiveAck,
    abortedLastRun,
  });
  if (inlineActionResult.kind === "reply") {
    await maybeEmitMissingResetHooks();
    return inlineActionResult.reply;
  }
  await maybeEmitMissingResetHooks();
  directives = inlineActionResult.directives;
  abortedLastRun = inlineActionResult.abortedLastRun ?? abortedLastRun;

  return runPreparedReply({
    ctx,
    sessionCtx,
    cfg,
    agentId,
    agentDir,
    agentCfg,
    sessionCfg,
    commandAuthorized,
    command,
    commandSource,
    allowTextCommands,
    directives,
    defaultActivation,
    resolvedVerboseLevel,
    blockStreamingEnabled,
    blockReplyChunking,
    resolvedBlockStreamingBreak,
    runtimeId,
    perMessageQueueMode,
    perMessageQueueOptions,
    typing,
    opts,
    timeoutMs,
    isNewSession,
    resetTriggered,
    systemSent,
    sessionEntry,
    sessionStore,
    sessionKey,
    sessionId,
    storePath,
    // @ts-expect-error — upstream feature not available in RemoteClaw fork
    workspaceDir,
    abortedLastRun,
  });
}
