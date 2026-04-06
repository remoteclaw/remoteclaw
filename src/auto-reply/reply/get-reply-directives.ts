import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { listChatCommands, shouldHandleTextCommands } from "../commands-registry.js";
import type { MsgContext, TemplateContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { resolveBlockStreamingChunking } from "./block-streaming.js";
import { buildCommandContext } from "./commands.js";
import { type InlineDirectives, parseInlineDirectives } from "./directive-handling.js";
import { applyInlineDirectiveOverrides } from "./get-reply-directives-apply.js";
import { clearInlineDirectives } from "./get-reply-directives-utils.js";
import { defaultGroupActivation, resolveGroupRequireMention } from "./groups.js";
import { CURRENT_MESSAGE_MARKER, stripMentions, stripStructuralPrefixes } from "./mentions.js";

// Model catalog infrastructure gutted in RemoteClaw.
// Stub `createModelSelectionState` returns defaults so the downstream pipeline
// still receives the expected shape without loading model catalogs.
export async function createModelSelectionState(params: {
  cfg: RemoteClawConfig;
  agentCfg: NonNullable<NonNullable<RemoteClawConfig["agents"]>["defaults"]> | undefined;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  parentSessionKey?: string;
  storePath?: string;
  defaultProvider: string;
  defaultModel: string;
  provider: string;
  model: string;
  hasModelDirective: boolean;
  hasResolvedHeartbeatModelOverride?: boolean;
}) {
  return {
    provider: params.provider,
    model: params.model,
    allowedModelKeys: new Set<string>(),
    allowedModelCatalog: [] as Array<{ id: string; provider: string }>,
    resetModelOverride: false,
    needsModelCatalog: false,
  };
}

function resolveContextTokens(params: {
  agentCfg: NonNullable<NonNullable<RemoteClawConfig["agents"]>["defaults"]> | undefined;
  model: string;
}): number {
  // Context token lookup from model catalog gutted in RemoteClaw — CLI agents manage their own context.
  return params.agentCfg?.contextTokens ?? 200_000;
}
import { stripInlineStatus } from "./reply-inline.js";
import type { TypingController } from "./typing.js";

type AgentDefaults = NonNullable<RemoteClawConfig["agents"]>["defaults"];

export type ReplyDirectiveContinuation = {
  commandSource: string;
  command: ReturnType<typeof buildCommandContext>;
  allowTextCommands: boolean;
  directives: InlineDirectives;
  cleanedBody: string;
  messageProviderKey: string;
  defaultActivation: ReturnType<typeof defaultGroupActivation>;
  resolvedVerboseLevel: VerboseLevel | undefined;
  blockStreamingEnabled: boolean;
  blockReplyChunking?: {
    minChars: number;
    maxChars: number;
    breakPreference: "paragraph" | "newline" | "sentence";
    flushOnParagraph?: boolean;
  };
  resolvedBlockStreamingBreak: "text_end" | "message_end";
  provider: string;
  model: string;
  modelState: Awaited<ReturnType<typeof createModelSelectionState>>;
  contextTokens: number;
  inlineStatusRequested: boolean;
  directiveAck?: ReplyPayload;
  perMessageQueueMode?: InlineDirectives["queueMode"];
  perMessageQueueOptions?: {
    debounceMs?: number;
    cap?: number;
    dropPolicy?: InlineDirectives["dropPolicy"];
  };
};

export type ReplyDirectiveResult =
  | { kind: "reply"; reply: ReplyPayload | ReplyPayload[] | undefined }
  | { kind: "continue"; result: ReplyDirectiveContinuation };

export async function resolveReplyDirectives(params: {
  ctx: MsgContext;
  cfg: RemoteClawConfig;
  agentId: string;
  workspaceDir: string;
  agentCfg: AgentDefaults;
  sessionCtx: TemplateContext;
  sessionEntry: SessionEntry;
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
  sessionScope: Parameters<typeof applyInlineDirectiveOverrides>[0]["sessionScope"];
  groupResolution: Parameters<typeof resolveGroupRequireMention>[0]["groupResolution"];
  isGroup: boolean;
  triggerBodyNormalized: string;
  commandAuthorized: boolean;
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: Map<string, { provider: string; model: string }>;
  provider: string;
  model: string;
  hasResolvedHeartbeatModelOverride: boolean;
  typing: TypingController;
  opts?: GetReplyOptions;
}): Promise<ReplyDirectiveResult> {
  const {
    ctx,
    cfg,
    agentId,
    agentCfg,
    workspaceDir: _workspaceDir,
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
    defaultProvider,
    defaultModel,
    provider: initialProvider,
    model: initialModel,
    hasResolvedHeartbeatModelOverride,
    typing,
    opts,
  } = params;
  let provider = initialProvider;
  let model = initialModel;

  // Prefer CommandBody/RawBody (clean message without structural context) for directive parsing.
  // Keep `Body`/`BodyStripped` as the best-available prompt text (may include context).
  const commandSource =
    sessionCtx.BodyForCommands ??
    sessionCtx.CommandBody ??
    sessionCtx.RawBody ??
    sessionCtx.Transcript ??
    sessionCtx.BodyStripped ??
    sessionCtx.Body ??
    ctx.BodyForCommands ??
    ctx.CommandBody ??
    ctx.RawBody ??
    "";
  const promptSource = sessionCtx.BodyForAgent ?? sessionCtx.BodyStripped ?? sessionCtx.Body ?? "";
  const commandText = commandSource || promptSource;
  const command = buildCommandContext({
    ctx,
    cfg,
    agentId,
    sessionKey,
    isGroup,
    triggerBodyNormalized,
    commandAuthorized,
  });
  const allowTextCommands = shouldHandleTextCommands({
    cfg,
    surface: command.surface,
    commandSource: ctx.CommandSource,
  });
  const reservedCommands = new Set(
    listChatCommands().flatMap((cmd) =>
      cmd.textAliases.map((a) => a.replace(/^\//, "").toLowerCase()),
    ),
  );

  const rawAliases = Object.values(cfg.agents?.defaults?.models ?? {})
    .map((entry) => entry.alias?.trim())
    .filter((alias): alias is string => Boolean(alias))
    .filter((alias) => !reservedCommands.has(alias.toLowerCase()));

  const configuredAliases = rawAliases.filter(
    (alias) => !reservedCommands.has(alias.toLowerCase()),
  );
  const allowStatusDirective = allowTextCommands && command.isAuthorizedSender;
  let parsedDirectives = parseInlineDirectives(commandText, {
    modelAliases: configuredAliases,
    allowStatusDirective,
  });
  const hasInlineStatus =
    parsedDirectives.hasStatusDirective && parsedDirectives.cleaned.trim().length > 0;
  if (hasInlineStatus) {
    parsedDirectives = {
      ...parsedDirectives,
      hasStatusDirective: false,
    };
  }
  const hasInlineDirective =
    parsedDirectives.hasVerboseDirective ||
    parsedDirectives.hasModelDirective ||
    parsedDirectives.hasQueueDirective;
  if (hasInlineDirective) {
    const stripped = stripStructuralPrefixes(parsedDirectives.cleaned);
    const noMentions = isGroup ? stripMentions(stripped, ctx, cfg, agentId) : stripped;
    if (noMentions.trim().length > 0) {
      const directiveOnlyCheck = parseInlineDirectives(noMentions, {
        modelAliases: configuredAliases,
      });
      if (directiveOnlyCheck.cleaned.trim().length > 0) {
        const allowInlineStatus =
          parsedDirectives.hasStatusDirective && allowTextCommands && command.isAuthorizedSender;
        parsedDirectives = allowInlineStatus
          ? {
              ...clearInlineDirectives(parsedDirectives.cleaned),
              hasStatusDirective: true,
            }
          : clearInlineDirectives(parsedDirectives.cleaned);
      }
    }
  }
  // Use command.isAuthorizedSender (resolved authorization) instead of raw commandAuthorized
  // to ensure inline directives work when commands.allowFrom grants access (e.g., LINE).
  let directives = command.isAuthorizedSender
    ? parsedDirectives
    : {
        ...parsedDirectives,
        hasVerboseDirective: false,
        hasStatusDirective: false,
        hasModelDirective: false,
        hasQueueDirective: false,
        queueReset: false,
      };
  const existingBody = sessionCtx.BodyStripped ?? sessionCtx.Body ?? "";
  let cleanedBody = (() => {
    if (!existingBody) {
      return parsedDirectives.cleaned;
    }
    if (!sessionCtx.CommandBody && !sessionCtx.RawBody) {
      return parseInlineDirectives(existingBody, {
        modelAliases: configuredAliases,
        allowStatusDirective,
      }).cleaned;
    }

    const markerIndex = existingBody.indexOf(CURRENT_MESSAGE_MARKER);
    if (markerIndex < 0) {
      return parseInlineDirectives(existingBody, {
        modelAliases: configuredAliases,
        allowStatusDirective,
      }).cleaned;
    }

    const head = existingBody.slice(0, markerIndex + CURRENT_MESSAGE_MARKER.length);
    const tail = existingBody.slice(markerIndex + CURRENT_MESSAGE_MARKER.length);
    const cleanedTail = parseInlineDirectives(tail, {
      modelAliases: configuredAliases,
      allowStatusDirective,
    }).cleaned;
    return `${head}${cleanedTail}`;
  })();

  if (allowStatusDirective) {
    cleanedBody = stripInlineStatus(cleanedBody).cleaned;
  }

  sessionCtx.BodyForAgent = cleanedBody;
  sessionCtx.Body = cleanedBody;
  sessionCtx.BodyStripped = cleanedBody;

  const messageProviderKey =
    sessionCtx.Provider?.trim().toLowerCase() ?? ctx.Provider?.trim().toLowerCase() ?? "";

  const requireMention = resolveGroupRequireMention({
    cfg,
    ctx: sessionCtx,
    groupResolution,
  });
  const defaultActivation = defaultGroupActivation(requireMention);
  const resolvedVerboseLevel =
    directives.verboseLevel ??
    (sessionEntry?.verboseLevel as VerboseLevel | undefined) ??
    (agentCfg?.verboseDefault as VerboseLevel | undefined);
  const resolvedBlockStreaming =
    opts?.disableBlockStreaming === true
      ? "off"
      : opts?.disableBlockStreaming === false
        ? "on"
        : agentCfg?.blockStreamingDefault === "on"
          ? "on"
          : "off";
  const resolvedBlockStreamingBreak: "text_end" | "message_end" =
    agentCfg?.blockStreamingBreak === "message_end" ? "message_end" : "text_end";
  const blockStreamingEnabled =
    resolvedBlockStreaming === "on" && opts?.disableBlockStreaming !== true;
  const blockReplyChunking = blockStreamingEnabled
    ? resolveBlockStreamingChunking(cfg, sessionCtx.Provider, sessionCtx.AccountId)
    : undefined;

  const modelState = await createModelSelectionState({
    cfg,
    agentCfg,
    sessionEntry,
    sessionStore,
    sessionKey,
    parentSessionKey: ctx.ParentSessionKey,
    storePath,
    defaultProvider,
    defaultModel,
    provider,
    model,
    hasModelDirective: directives.hasModelDirective,
    hasResolvedHeartbeatModelOverride,
  });
  provider = modelState.provider;
  model = modelState.model;

  let contextTokens = resolveContextTokens({
    agentCfg,
    model,
  });

  const initialModelLabel = `${provider}/${model}`;
  const formatModelSwitchEvent = (label: string, alias?: string) =>
    alias ? `Model switched to ${alias} (${label}).` : `Model switched to ${label}.`;
  const isModelListAlias =
    directives.hasModelDirective &&
    ["status", "list"].includes(directives.rawModelDirective?.trim().toLowerCase() ?? "");
  const effectiveModelDirective = isModelListAlias ? undefined : directives.rawModelDirective;

  const inlineStatusRequested = hasInlineStatus && allowTextCommands && command.isAuthorizedSender;

  const applyResult = await applyInlineDirectiveOverrides({
    ctx,
    cfg,
    agentId,
    agentCfg,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    sessionScope,
    isGroup,
    allowTextCommands,
    command,
    directives,
    messageProviderKey,
    defaultProvider,
    defaultModel,
    aliasIndex: params.aliasIndex,
    provider,
    model,
    modelState,
    initialModelLabel,
    formatModelSwitchEvent,
    defaultActivation: () => defaultActivation,
    contextTokens,
    effectiveModelDirective,
    typing,
  });
  if (applyResult.kind === "reply") {
    return { kind: "reply", reply: applyResult.reply };
  }
  directives = applyResult.directives;
  provider = applyResult.provider;
  model = applyResult.model;
  contextTokens = applyResult.contextTokens;
  const { directiveAck, perMessageQueueMode, perMessageQueueOptions } = applyResult;

  return {
    kind: "continue",
    result: {
      commandSource: commandText,
      command,
      allowTextCommands,
      directives,
      cleanedBody,
      messageProviderKey,
      defaultActivation,
      resolvedVerboseLevel,
      blockStreamingEnabled,
      blockReplyChunking,
      resolvedBlockStreamingBreak,
      provider,
      model,
      modelState,
      contextTokens,
      inlineStatusRequested,
      directiveAck,
      perMessageQueueMode,
      perMessageQueueOptions,
    },
  };
}
