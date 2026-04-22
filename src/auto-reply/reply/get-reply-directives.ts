import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { listChatCommands, shouldHandleTextCommands } from "../commands-registry.js";
import type { MsgContext, TemplateContext } from "../templating.js";
import type { ElevatedLevel, ReasoningLevel, VerboseLevel } from "../thinking.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { resolveBlockStreamingChunking } from "./block-streaming.js";
import { buildCommandContext } from "./commands.js";
import { type InlineDirectives, parseInlineDirectives } from "./directive-handling.js";
import { applyInlineDirectiveOverrides } from "./get-reply-directives-apply.js";
import { clearInlineDirectives } from "./get-reply-directives-utils.js";
import { defaultGroupActivation, resolveGroupRequireMention } from "./groups.js";
import { CURRENT_MESSAGE_MARKER, stripMentions, stripStructuralPrefixes } from "./mentions.js";
import { stripInlineStatus } from "./reply-inline.js";

// Gutted in RemoteClaw fork — CLI runtimes manage their own model/sandbox/elevated state
type ExecToolDefaults = Record<string, unknown>;

import type { TypingController } from "./typing.js";

type AgentDefaults = NonNullable<RemoteClawConfig["agents"]>["defaults"];
type ExecOverrides = Pick<ExecToolDefaults, "host" | "security" | "ask" | "node">;

export type ReplyDirectiveContinuation = {
  commandSource: string;
  command: ReturnType<typeof buildCommandContext>;
  allowTextCommands: boolean;
  directives: InlineDirectives;
  cleanedBody: string;
  messageProviderKey: string;
  elevatedEnabled: boolean;
  elevatedAllowed: boolean;
  elevatedFailures: { gate: string; key: string }[];
  defaultActivation: ReturnType<typeof defaultGroupActivation>;
  resolvedVerboseLevel: VerboseLevel | undefined;
  elevated?: boolean;
  execOverrides?: ExecOverrides;
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
  inlineStatusRequested: boolean;
  directiveAck?: ReplyPayload;
  perMessageQueueMode?: InlineDirectives["queueMode"];
  perMessageQueueOptions?: {
    debounceMs?: number;
    cap?: number;
    dropPolicy?: InlineDirectives["dropPolicy"];
  };
  resolvedReasoningLevel?: ReasoningLevel;
  resolvedElevatedLevel?: ElevatedLevel;
  contextTokens?: number;
};

function resolveExecOverrides(_params: {
  directives: InlineDirectives;
  sessionEntry?: SessionEntry;
}): ExecOverrides | undefined {
  return undefined;
}

export type ReplyDirectiveResult =
  | { kind: "reply"; reply: ReplyPayload | ReplyPayload[] | undefined }
  | { kind: "continue"; result: ReplyDirectiveContinuation };

export async function resolveReplyDirectives(params: {
  ctx: MsgContext;
  cfg: RemoteClawConfig;
  agentId: string;
  agentDir: string;
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
  runtimeId?: string;
  defaultProvider?: string;
  defaultModel?: string;
  aliasIndex?: unknown;
  provider?: string;
  model?: string;
  typing: TypingController;
  opts?: GetReplyOptions;
  workspaceDir?: string;
  skillFilter?: unknown;
}): Promise<ReplyDirectiveResult> {
  const {
    ctx,
    cfg,
    agentId,
    agentCfg,
    agentDir,
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
    runtimeId: _runtimeId,
    typing,
    opts,
  } = params;
  // Model selection: use new upstream params if available, fall back to runtimeId for back-compat.
  const defaultProvider = params.defaultProvider ?? params.runtimeId ?? "anthropic";
  const defaultModel = params.defaultModel ?? "default";
  let provider = params.provider ?? params.runtimeId ?? defaultProvider;
  let model = defaultModel;

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

  // Model catalog gutted — aliases extracted from legacy config for compat.
  const legacyModels = (cfg.agents?.defaults as Record<string, unknown> | undefined)?.models as
    | Record<string, { alias?: string }>
    | undefined;
  const rawAliases = Object.values(legacyModels ?? {})
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
    parsedDirectives.hasVerboseDirective || parsedDirectives.hasQueueDirective;
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
  const elevatedEnabled = false;
  const elevatedAllowed = false;
  const elevatedFailures: { gate: string; key: string }[] = [];

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

  const initialModelLabel = `${provider}/${model}`;
  const formatModelSwitchEvent = (label: string, alias?: string) =>
    alias ? `Model switched to ${alias} (${label}).` : `Model switched to ${label}.`;
  const inlineStatusRequested = hasInlineStatus && allowTextCommands && command.isAuthorizedSender;

  const applyResult = await applyInlineDirectiveOverrides({
    ctx,
    cfg,
    agentId,
    agentDir,
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
    elevatedEnabled,
    elevatedAllowed,
    elevatedFailures,
    runtimeId: params.runtimeId ?? defaultProvider,
    provider,
    model,
    initialModelLabel,
    formatModelSwitchEvent,
    defaultActivation: () => defaultActivation,
    typing,
  });
  if (applyResult.kind === "reply") {
    return { kind: "reply", reply: applyResult.reply };
  }
  directives = applyResult.directives;
  provider = applyResult.provider;
  model = applyResult.model;
  const { directiveAck, perMessageQueueMode, perMessageQueueOptions } = applyResult;
  const execOverrides = resolveExecOverrides({ directives, sessionEntry });

  return {
    kind: "continue",
    result: {
      commandSource: commandText,
      command,
      allowTextCommands,
      directives,
      cleanedBody,
      messageProviderKey,
      elevatedEnabled,
      elevatedAllowed,
      elevatedFailures,
      defaultActivation,
      resolvedVerboseLevel,
      execOverrides,
      blockStreamingEnabled,
      blockReplyChunking,
      resolvedBlockStreamingBreak,
      provider,
      model,
      inlineStatusRequested,
      directiveAck,
      perMessageQueueMode,
      perMessageQueueOptions,
    },
  };
}
