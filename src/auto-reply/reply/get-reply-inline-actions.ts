import { getChannelDock } from "../../channels/dock.js";
import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { updateSessionStore } from "../../config/sessions.js";
import type { MsgContext, TemplateContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { getAbortMemory, isAbortRequestText, shouldSkipMessageByAbortCutoff } from "./abort.js";
import { buildStatusReply, handleCommands } from "./commands.js";
import type { InlineDirectives } from "./directive-handling.js";
import { isDirectiveOnly } from "./directive-handling.js";
import { extractInlineSimpleCommand } from "./reply-inline.js";
import type { TypingController } from "./typing.js";

export type InlineActionResult =
  | { kind: "reply"; reply: ReplyPayload | ReplyPayload[] | undefined }
  | {
      kind: "continue";
      directives: InlineDirectives;
      abortedLastRun: boolean;
    };

export async function handleInlineActions(params: {
  ctx: MsgContext;
  sessionCtx: TemplateContext;
  cfg: RemoteClawConfig;
  agentId: string;
  agentDir?: string;
  sessionEntry?: SessionEntry;
  previousSessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
  sessionScope: Parameters<typeof buildStatusReply>[0]["sessionScope"];
  workspaceDir: string;
  isGroup: boolean;
  opts?: GetReplyOptions;
  typing: TypingController;
  allowTextCommands: boolean;
  inlineStatusRequested: boolean;
  command: Parameters<typeof handleCommands>[0]["command"];
  directives: InlineDirectives;
  cleanedBody: string;
  defaultActivation: Parameters<typeof buildStatusReply>[0]["defaultGroupActivation"];
  resolvedVerboseLevel: VerboseLevel | undefined;
  provider: string;
  model: string;
  contextTokens: number;
  directiveAck?: ReplyPayload;
  abortedLastRun: boolean;
}): Promise<InlineActionResult> {
  const {
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
    workspaceDir,
    isGroup,
    opts,
    typing,
    allowTextCommands,
    inlineStatusRequested,
    command,
    directives: initialDirectives,
    cleanedBody: initialCleanedBody,
    defaultActivation,
    resolvedVerboseLevel,
    provider,
    model,
    contextTokens,
    directiveAck,
    abortedLastRun: initialAbortedLastRun,
  } = params;

  let directives = initialDirectives;
  let cleanedBody = initialCleanedBody;

  const sendInlineReply = async (reply?: ReplyPayload) => {
    if (!reply) {
      return;
    }
    if (!opts?.onBlockReply) {
      return;
    }
    await opts.onBlockReply(reply);
  };

  const clearAbortCutoff = async () => {
    if (!sessionEntry || !sessionStore || !sessionKey) {
      return;
    }
    if (
      sessionEntry.abortCutoffMessageSid === undefined &&
      sessionEntry.abortCutoffTimestamp === undefined
    ) {
      return;
    }
    sessionEntry.abortCutoffMessageSid = undefined;
    sessionEntry.abortCutoffTimestamp = undefined;
    sessionEntry.updatedAt = Date.now();
    sessionStore[sessionKey] = sessionEntry;
    if (storePath) {
      await updateSessionStore(storePath, (store) => {
        const existing = store[sessionKey] ?? sessionEntry;
        if (!existing) {
          return;
        }
        existing.abortCutoffMessageSid = undefined;
        existing.abortCutoffTimestamp = undefined;
        existing.updatedAt = Date.now();
        store[sessionKey] = existing;
      });
    }
  };

  const isStopLikeInbound = isAbortRequestText(command.rawBodyNormalized);
  if (!isStopLikeInbound && sessionEntry) {
    const shouldSkip = shouldSkipMessageByAbortCutoff({
      cutoffMessageSid: sessionEntry.abortCutoffMessageSid,
      cutoffTimestamp: sessionEntry.abortCutoffTimestamp,
      messageSid:
        (typeof ctx.MessageSidFull === "string" && ctx.MessageSidFull.trim()) ||
        (typeof ctx.MessageSid === "string" && ctx.MessageSid.trim()) ||
        undefined,
      timestamp: typeof ctx.Timestamp === "number" ? ctx.Timestamp : undefined,
    });
    if (shouldSkip) {
      typing.cleanup();
      return { kind: "reply", reply: undefined };
    }
    if (
      sessionEntry.abortCutoffMessageSid !== undefined ||
      sessionEntry.abortCutoffTimestamp !== undefined
    ) {
      await clearAbortCutoff();
    }
  }

  const inlineCommand =
    allowTextCommands && command.isAuthorizedSender
      ? extractInlineSimpleCommand(cleanedBody)
      : null;
  if (inlineCommand) {
    cleanedBody = inlineCommand.cleaned;
    sessionCtx.Body = cleanedBody;
    sessionCtx.BodyForAgent = cleanedBody;
    sessionCtx.BodyStripped = cleanedBody;
  }

  const handleInlineStatus =
    !isDirectiveOnly({
      directives,
      cleanedBody: directives.cleaned,
      ctx,
      cfg,
      agentId,
      isGroup,
    }) && inlineStatusRequested;
  if (handleInlineStatus) {
    const inlineStatusReply = await buildStatusReply({
      cfg,
      command,
      sessionEntry,
      sessionKey,
      parentSessionKey: ctx.ParentSessionKey,
      sessionScope,
      provider,
      model,
      contextTokens,
      resolvedVerboseLevel: resolvedVerboseLevel ?? "off",
      isGroup,
      defaultGroupActivation: defaultActivation,
    });
    await sendInlineReply(inlineStatusReply);
    directives = { ...directives, hasStatusDirective: false };
  }

  const runCommands = (commandInput: typeof command) =>
    handleCommands({
      ctx,
      cfg,
      command: commandInput,
      agentId,
      agentDir,
      directives,
      sessionEntry,
      previousSessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      sessionScope,
      workspaceDir,
      defaultGroupActivation: defaultActivation,
      resolvedVerboseLevel: resolvedVerboseLevel ?? "off",
      provider,
      model,
      contextTokens,
      isGroup,
    });

  if (inlineCommand) {
    const inlineCommandContext = {
      ...command,
      rawBodyNormalized: inlineCommand.command,
      commandBodyNormalized: inlineCommand.command,
    };
    const inlineResult = await runCommands(inlineCommandContext);
    if (inlineResult.reply) {
      if (!inlineCommand.cleaned) {
        typing.cleanup();
        return { kind: "reply", reply: inlineResult.reply };
      }
      await sendInlineReply(inlineResult.reply);
    }
  }

  if (directiveAck) {
    await sendInlineReply(directiveAck);
  }

  const isEmptyConfig = Object.keys(cfg).length === 0;
  const skipWhenConfigEmpty = command.channelId
    ? Boolean(getChannelDock(command.channelId)?.commands?.skipWhenConfigEmpty)
    : false;
  if (
    skipWhenConfigEmpty &&
    isEmptyConfig &&
    command.from &&
    command.to &&
    command.from !== command.to
  ) {
    typing.cleanup();
    return { kind: "reply", reply: undefined };
  }

  let abortedLastRun = initialAbortedLastRun;
  if (!sessionEntry && command.abortKey) {
    abortedLastRun = getAbortMemory(command.abortKey) ?? false;
  }

  const commandResult = await runCommands(command);
  if (!commandResult.shouldContinue) {
    typing.cleanup();
    return { kind: "reply", reply: commandResult.reply };
  }

  return {
    kind: "continue",
    directives,
    abortedLastRun,
  };
}
