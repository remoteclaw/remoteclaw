import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { MsgContext } from "../templating.js";
import type { ReplyPayload } from "../types.js";
import { buildStatusReply } from "./commands.js";
import {
  applyInlineDirectivesFastLane,
  handleDirectiveOnly,
  type InlineDirectives,
  isDirectiveOnly,
  persistInlineDirectives,
} from "./directive-handling.js";
import { resolveCurrentDirectiveLevels } from "./directive-handling.levels.js";
import { clearInlineDirectives } from "./get-reply-directives-utils.js";
import type { createModelSelectionState } from "./get-reply-directives.js";
import type { TypingController } from "./typing.js";

type AgentDefaults = NonNullable<RemoteClawConfig["agents"]>["defaults"];

export type ApplyDirectiveResult =
  | { kind: "reply"; reply: ReplyPayload | ReplyPayload[] | undefined }
  | {
      kind: "continue";
      directives: InlineDirectives;
      provider: string;
      model: string;
      contextTokens: number;
      directiveAck?: ReplyPayload;
      perMessageQueueMode?: InlineDirectives["queueMode"];
      perMessageQueueOptions?: {
        debounceMs?: number;
        cap?: number;
        dropPolicy?: InlineDirectives["dropPolicy"];
      };
    };

export async function applyInlineDirectiveOverrides(params: {
  ctx: MsgContext;
  cfg: RemoteClawConfig;
  agentId: string;
  agentDir?: string;
  agentCfg: AgentDefaults;
  sessionEntry: SessionEntry;
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
  sessionScope: Parameters<typeof buildStatusReply>[0]["sessionScope"];
  isGroup: boolean;
  allowTextCommands: boolean;
  command: Parameters<typeof buildStatusReply>[0]["command"];
  directives: InlineDirectives;
  messageProviderKey: string;
  runtimeId: string;
  provider: string;
  model: string;
  modelState: Awaited<ReturnType<typeof createModelSelectionState>>;
  initialModelLabel: string;
  formatModelSwitchEvent: (label: string, alias?: string) => string;
  defaultActivation: () => ReturnType<
    Parameters<typeof buildStatusReply>[0]["defaultGroupActivation"]
  >;
  contextTokens: number;
  /** Upstream feature: whether elevated security is enabled. */
  elevatedEnabled?: boolean;
  /** Upstream feature: elevated security allowed for this context. */
  elevatedAllowed?: boolean;
  /** Upstream feature: elevated security failure reasons. */
  elevatedFailures?: string[];
  /** Upstream feature: resolved elevated security level. */
  resolvedElevatedLevel?: string;
  typing: TypingController;
}): Promise<ApplyDirectiveResult> {
  const {
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
    messageProviderKey,
    runtimeId,
    modelState,
    initialModelLabel,
    formatModelSwitchEvent,
    defaultActivation,
    typing,
  } = params;
  let { directives } = params;
  let { provider, model } = params;
  let { contextTokens } = params;
  // Model selection gutted in RemoteClaw — derive from runtimeId.
  const defaultProvider = runtimeId;
  const defaultModel = "default";
  const aliasIndex = new Map<string, { provider: string; model: string }>();
  const directiveModelState = {
    allowedModelKeys: modelState.allowedModelKeys,
    allowedModelCatalog: modelState.allowedModelCatalog,
    resetModelOverride: modelState.resetModelOverride,
  };
  const createDirectiveHandlingBase = () => ({
    cfg,
    directives,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    messageProviderKey,
    defaultProvider,
    defaultModel,
    aliasIndex,
    ...directiveModelState,
    provider,
    model,
    initialModelLabel,
    formatModelSwitchEvent,
  });

  let directiveAck: ReplyPayload | undefined;

  if (!command.isAuthorizedSender) {
    directives = clearInlineDirectives(directives.cleaned);
  }

  if (
    isDirectiveOnly({
      directives,
      cleanedBody: directives.cleaned,
      ctx,
      cfg,
      agentId,
      isGroup,
    })
  ) {
    if (!command.isAuthorizedSender) {
      typing.cleanup();
      return { kind: "reply", reply: undefined };
    }
    // @ts-expect-error — upstream feature not available in RemoteClaw fork
    const { currentVerboseLevel } = await resolveCurrentDirectiveLevels({
      sessionEntry,
      agentCfg,
    });
    const directiveReply = await handleDirectiveOnly({
      ...createDirectiveHandlingBase(),
      currentVerboseLevel,
      surface: ctx.Surface,
    });
    let statusReply: ReplyPayload | undefined;
    if (directives.hasStatusDirective && allowTextCommands && command.isAuthorizedSender) {
      statusReply = await buildStatusReply({
        cfg,
        command,
        sessionEntry,
        sessionKey,
        parentSessionKey: ctx.ParentSessionKey,
        sessionScope,
        provider,
        model,
        contextTokens,
        resolvedVerboseLevel: currentVerboseLevel ?? "off",
        isGroup,
        defaultGroupActivation: defaultActivation,
      });
    }
    typing.cleanup();
    if (statusReply?.text && directiveReply?.text) {
      return {
        kind: "reply",
        reply: { text: `${directiveReply.text}\n${statusReply.text}` },
      };
    }
    return { kind: "reply", reply: statusReply ?? directiveReply };
  }

  const hasAnyDirective =
    directives.hasVerboseDirective ||
    directives.hasModelDirective ||
    directives.hasQueueDirective ||
    directives.hasStatusDirective;

  if (hasAnyDirective && command.isAuthorizedSender) {
    const fastLane = await applyInlineDirectivesFastLane({
      directives,
      commandAuthorized: command.isAuthorizedSender,
      ctx,
      cfg,
      agentId,
      isGroup,
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      messageProviderKey,
      defaultProvider,
      defaultModel,
      aliasIndex,
      ...directiveModelState,
      provider,
      model,
      initialModelLabel,
      formatModelSwitchEvent,
      agentCfg,
      modelState: {
        ...directiveModelState,
      },
    });
    directiveAck = fastLane.directiveAck;
    provider = fastLane.provider;
    model = fastLane.model;
  }

  const persisted = await persistInlineDirectives({
    directives,
    cfg,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    agentCfg,
  });
  contextTokens = persisted.contextTokens;

  const perMessageQueueMode =
    directives.hasQueueDirective && !directives.queueReset ? directives.queueMode : undefined;
  const perMessageQueueOptions =
    directives.hasQueueDirective && !directives.queueReset
      ? {
          debounceMs: directives.debounceMs,
          cap: directives.cap,
          dropPolicy: directives.dropPolicy,
        }
      : undefined;

  return {
    kind: "continue",
    directives,
    provider,
    model,
    contextTokens,
    directiveAck,
    perMessageQueueMode,
    perMessageQueueOptions,
  };
}
