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
import { clearInlineDirectives } from "./get-reply-directives-utils.js";
import type { TypingController } from "./typing.js";

type AgentDefaults = NonNullable<RemoteClawConfig["agents"]>["defaults"];

export type ApplyDirectiveResult =
  | { kind: "reply"; reply: ReplyPayload | ReplyPayload[] | undefined }
  | {
      kind: "continue";
      directives: InlineDirectives;
      provider: string;
      model: string;
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
  initialModelLabel: string;
  formatModelSwitchEvent: (label: string, alias?: string) => string;
  defaultActivation: () => ReturnType<
    Parameters<typeof buildStatusReply>[0]["defaultGroupActivation"]
  >;
  /** Upstream feature: whether elevated security is enabled. */
  elevatedEnabled?: boolean;
  /** Upstream feature: elevated security allowed for this context. */
  elevatedAllowed?: boolean;
  /** Upstream feature: elevated security failure reasons. */
  elevatedFailures?: { gate: string; key: string }[];
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
    initialModelLabel,
    formatModelSwitchEvent,
    defaultActivation,
    typing,
  } = params;
  let { directives } = params;
  let { provider, model } = params;
  // Model selection gutted in RemoteClaw — derive from runtimeId and pass empty lookups.
  const defaultProvider = runtimeId;
  const defaultModel = "default";
  const aliasIndex = new Map<string, { provider: string; model: string }>();
  const directiveModelState = {
    allowedModelKeys: new Set<string>(),
    allowedModelCatalog: [] as Array<{ id: string; provider: string }>,
    resetModelOverride: false,
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
    const currentVerboseLevel =
      (sessionEntry?.verboseLevel as import("../thinking.js").VerboseLevel | undefined) ??
      (agentCfg?.verboseDefault as import("../thinking.js").VerboseLevel | undefined);
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
    directives.hasVerboseDirective || directives.hasQueueDirective || directives.hasStatusDirective;

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
    });
    directiveAck = fastLane.directiveAck;
    provider = fastLane.provider;
    model = fastLane.model;
  }

  await persistInlineDirectives({
    directives,
    cfg,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
  });
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
    directiveAck,
    perMessageQueueMode,
    perMessageQueueOptions,
  };
}
