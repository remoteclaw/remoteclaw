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
    defaultActivation,
    typing,
  } = params;
  let { directives } = params;
  const { provider, model } = params;

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
      cfg,
      directives,
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      messageProviderKey,
      currentVerboseLevel,
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
      agentCfg,
    });
    directiveAck = fastLane.directiveAck;
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
    directiveAck,
    perMessageQueueMode,
    perMessageQueueOptions,
  };
}
