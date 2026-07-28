// Channel-plugin factory carved from upstream OpenClaw `src/plugin-sdk/core.ts`
// (v5.27) into the RemoteClaw fork. The fork's own `plugin-sdk/core.ts` is a
// gutted barrel; the real chat-channel builders live here so channel adapters
// can import them without dragging the gutted execution runtime. Wired to the
// fork-kept `channels/plugins/helpers.js`, the fork's channel `registry.js`
// (`getChatChannelMeta`), the `types.*` modules, and the ported
// `channels/plugins/threading-helpers.js` helper.
//
// Adapted to the fork's leaner channel-plugin surface: upstream v5.27 fields
// absent in the fork are dropped rather than reintroduced — `conversationBindings`,
// `setupWizard`/`doctor`/`gatewayMethodDescriptors` (not on `ChannelPlugin`),
// `collectAuditFindings` (not on `ChannelSecurityAdapter`), and
// `inheritSharedDefaultsFromDefaultAccount` (not on `buildAccountScopedDmSecurityPolicy`).
import { buildAccountScopedDmSecurityPolicy } from "../channels/plugins/helpers.js";
import {
  createScopedAccountReplyToModeResolver,
  createTopLevelChannelReplyToModeResolver,
} from "../channels/plugins/threading-helpers.js";
import type {
  ChannelOutboundAdapter,
  ChannelPairingAdapter,
  ChannelSecurityAdapter,
} from "../channels/plugins/types.adapters.js";
import type {
  ChannelId,
  ChannelMeta,
  ChannelPollResult,
  ChannelThreadingAdapter,
} from "../channels/plugins/types.core.js";
import type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
import { getChatChannelMeta, normalizeChatChannelId } from "../channels/registry.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { ReplyToMode } from "../config/types.base.js";
import { buildOutboundBaseSessionKey } from "../infra/outbound/base-session-key.js";
import type { OutboundDeliveryResult } from "../infra/outbound/deliver.js";
import type { OutboundSessionRoute } from "../infra/outbound/outbound-session.js";
import { normalizeOutboundThreadId } from "../infra/outbound/thread-id.js";
import type { RoutePeer } from "../routing/resolve-route.js";
import { resolveThreadSessionKeys } from "../routing/session-key.js";
import {
  normalizeSessionKeyPreservingOpaquePeerIds,
  parseThreadSessionSuffix,
} from "../sessions/session-key-utils.js";

function createInlineTextPairingAdapter(params: {
  idLabel: string;
  message: string;
  normalizeAllowEntry?: ChannelPairingAdapter["normalizeAllowEntry"];
  notify: (
    params: Parameters<NonNullable<ChannelPairingAdapter["notifyApproval"]>>[0] & {
      message: string;
    },
  ) => Promise<void> | void;
}): ChannelPairingAdapter {
  return {
    idLabel: params.idLabel,
    normalizeAllowEntry: params.normalizeAllowEntry,
    notifyApproval: async (ctx) => {
      await params.notify({ ...ctx, message: params.message });
    },
  };
}

// The fork resolves bundled chat-channel metadata via its own channel registry
// (`getChatChannelMeta`), which is precomputed at module load. `ChannelPlugin`
// ids are the broad `ChannelId`; normalize to a known chat channel first and
// fall back to `undefined` for non-bundled ids (spreading `undefined` is a no-op).
function resolveSdkChatChannelMeta(id: ChannelId): ChannelMeta | undefined {
  const channelId = normalizeChatChannelId(id);
  return channelId ? getChatChannelMeta(channelId) : undefined;
}

export type CreateChannelPluginBaseOptions<TResolvedAccount> = {
  id: ChannelPlugin<TResolvedAccount>["id"];
  meta?: Partial<NonNullable<ChannelPlugin<TResolvedAccount>["meta"]>>;
  capabilities?: ChannelPlugin<TResolvedAccount>["capabilities"];
  commands?: ChannelPlugin<TResolvedAccount>["commands"];
  agentPrompt?: ChannelPlugin<TResolvedAccount>["agentPrompt"];
  streaming?: ChannelPlugin<TResolvedAccount>["streaming"];
  reload?: ChannelPlugin<TResolvedAccount>["reload"];
  gatewayMethods?: ChannelPlugin<TResolvedAccount>["gatewayMethods"];
  configSchema?: ChannelPlugin<TResolvedAccount>["configSchema"];
  config?: ChannelPlugin<TResolvedAccount>["config"];
  security?: ChannelPlugin<TResolvedAccount>["security"];
  setup: NonNullable<ChannelPlugin<TResolvedAccount>["setup"]>;
  groups?: ChannelPlugin<TResolvedAccount>["groups"];
};

export type CreatedChannelPluginBase<TResolvedAccount> = Pick<
  ChannelPlugin<TResolvedAccount>,
  "id" | "meta" | "setup"
> &
  Partial<
    Pick<
      ChannelPlugin<TResolvedAccount>,
      | "capabilities"
      | "commands"
      | "agentPrompt"
      | "streaming"
      | "reload"
      | "gatewayMethods"
      | "configSchema"
      | "config"
      | "security"
      | "groups"
    >
  >;

export type ChatChannelPluginBase<TResolvedAccount, Probe, Audit> = Omit<
  ChannelPlugin<TResolvedAccount, Probe, Audit>,
  "security" | "pairing" | "threading" | "outbound"
> &
  Partial<
    Pick<
      ChannelPlugin<TResolvedAccount, Probe, Audit>,
      "security" | "pairing" | "threading" | "outbound"
    >
  >;

export type ChatChannelSecurityOptions<TResolvedAccount extends { accountId?: string | null }> = {
  dm: {
    channelKey: string;
    resolvePolicy: (account: TResolvedAccount) => string | null | undefined;
    resolveAllowFrom: (account: TResolvedAccount) => Array<string | number> | null | undefined;
    resolveFallbackAccountId?: (account: TResolvedAccount) => string | null | undefined;
    defaultPolicy?: string;
    allowFromPathSuffix?: string;
    policyPathSuffix?: string;
    approveChannelId?: string;
    approveHint?: string;
    normalizeEntry?: (raw: string) => string;
  };
  collectWarnings?: ChannelSecurityAdapter<TResolvedAccount>["collectWarnings"];
};

export type ChatChannelPairingOptions = {
  text: {
    idLabel: string;
    message: string;
    normalizeAllowEntry?: ChannelPairingAdapter["normalizeAllowEntry"];
    notify: (
      params: Parameters<NonNullable<ChannelPairingAdapter["notifyApproval"]>>[0] & {
        message: string;
      },
    ) => Promise<void> | void;
  };
};

export type ChatChannelThreadingReplyModeOptions<TResolvedAccount> =
  | { topLevelReplyToMode: string }
  | {
      scopedAccountReplyToMode: {
        resolveAccount: (cfg: RemoteClawConfig, accountId?: string | null) => TResolvedAccount;
        resolveReplyToMode: (
          account: TResolvedAccount,
          chatType?: string | null,
        ) => ReplyToMode | null | undefined;
        fallback?: ReplyToMode;
      };
    }
  | {
      resolveReplyToMode: NonNullable<ChannelThreadingAdapter["resolveReplyToMode"]>;
    };

export type ChatChannelThreadingOptions<TResolvedAccount> =
  ChatChannelThreadingReplyModeOptions<TResolvedAccount> &
    Omit<ChannelThreadingAdapter, "resolveReplyToMode">;

export type ChatChannelAttachedOutboundOptions = {
  base: Omit<ChannelOutboundAdapter, "sendText" | "sendMedia" | "sendPoll">;
  attachedResults: {
    channel: string;
    sendText?: (
      ctx: Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0],
    ) => MaybePromise<Omit<OutboundDeliveryResult, "channel">>;
    sendMedia?: (
      ctx: Parameters<NonNullable<ChannelOutboundAdapter["sendMedia"]>>[0],
    ) => MaybePromise<Omit<OutboundDeliveryResult, "channel">>;
    sendPoll?: (
      ctx: Parameters<NonNullable<ChannelOutboundAdapter["sendPoll"]>>[0],
    ) => MaybePromise<Omit<ChannelPollResult, "channel">>;
  };
};

type MaybePromise<T> = T | Promise<T>;

function createInlineAttachedChannelResultAdapter(
  params: ChatChannelAttachedOutboundOptions["attachedResults"],
) {
  return {
    sendText: params.sendText
      ? async (ctx: Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0]) => ({
          channel: params.channel,
          ...(await params.sendText!(ctx)),
        })
      : undefined,
    sendMedia: params.sendMedia
      ? async (ctx: Parameters<NonNullable<ChannelOutboundAdapter["sendMedia"]>>[0]) => ({
          channel: params.channel,
          ...(await params.sendMedia!(ctx)),
        })
      : undefined,
    sendPoll: params.sendPoll
      ? async (ctx: Parameters<NonNullable<ChannelOutboundAdapter["sendPoll"]>>[0]) => ({
          channel: params.channel,
          ...(await params.sendPoll!(ctx)),
        })
      : undefined,
  } satisfies Pick<ChannelOutboundAdapter, "sendText" | "sendMedia" | "sendPoll">;
}

function resolveChatChannelSecurity<TResolvedAccount extends { accountId?: string | null }>(
  security:
    | ChannelSecurityAdapter<TResolvedAccount>
    | ChatChannelSecurityOptions<TResolvedAccount>
    | undefined,
): ChannelSecurityAdapter<TResolvedAccount> | undefined {
  if (!security) {
    return undefined;
  }
  if (!("dm" in security)) {
    return security;
  }
  return {
    resolveDmPolicy: ({ cfg, accountId, account }) =>
      buildAccountScopedDmSecurityPolicy({
        cfg,
        channelKey: security.dm.channelKey,
        accountId,
        fallbackAccountId: security.dm.resolveFallbackAccountId?.(account) ?? account.accountId,
        policy: security.dm.resolvePolicy(account),
        allowFrom: security.dm.resolveAllowFrom(account) ?? [],
        defaultPolicy: security.dm.defaultPolicy,
        allowFromPathSuffix: security.dm.allowFromPathSuffix,
        policyPathSuffix: security.dm.policyPathSuffix,
        approveChannelId: security.dm.approveChannelId,
        approveHint: security.dm.approveHint,
        normalizeEntry: security.dm.normalizeEntry,
      }),
    ...(security.collectWarnings ? { collectWarnings: security.collectWarnings } : {}),
  };
}

function resolveChatChannelPairing(
  pairing: ChannelPairingAdapter | ChatChannelPairingOptions | undefined,
): ChannelPairingAdapter | undefined {
  if (!pairing) {
    return undefined;
  }
  if (!("text" in pairing)) {
    return pairing;
  }
  return createInlineTextPairingAdapter(pairing.text);
}

function resolveChatChannelThreading<TResolvedAccount>(
  threading: ChannelThreadingAdapter | ChatChannelThreadingOptions<TResolvedAccount> | undefined,
): ChannelThreadingAdapter | undefined {
  if (!threading) {
    return undefined;
  }
  if (!("topLevelReplyToMode" in threading) && !("scopedAccountReplyToMode" in threading)) {
    return threading;
  }

  let resolveReplyToMode: ChannelThreadingAdapter["resolveReplyToMode"];
  if ("topLevelReplyToMode" in threading) {
    resolveReplyToMode = createTopLevelChannelReplyToModeResolver(threading.topLevelReplyToMode);
  } else {
    resolveReplyToMode = createScopedAccountReplyToModeResolver<TResolvedAccount>(
      threading.scopedAccountReplyToMode,
    );
  }

  return {
    ...threading,
    resolveReplyToMode,
  };
}

function resolveChatChannelOutbound(
  outbound: ChannelOutboundAdapter | ChatChannelAttachedOutboundOptions | undefined,
): ChannelOutboundAdapter | undefined {
  if (!outbound) {
    return undefined;
  }
  if (!("attachedResults" in outbound)) {
    return outbound;
  }
  return {
    ...outbound.base,
    ...createInlineAttachedChannelResultAdapter(outbound.attachedResults),
  };
}

// Shared higher-level builder for chat-style channels that mostly compose
// scoped DM security, text pairing, reply threading, and attached send results.
export function createChatChannelPlugin<
  TResolvedAccount extends { accountId?: string | null },
  Probe = unknown,
  Audit = unknown,
>(params: {
  base: ChatChannelPluginBase<TResolvedAccount, Probe, Audit>;
  security?:
    | ChannelSecurityAdapter<TResolvedAccount>
    | ChatChannelSecurityOptions<TResolvedAccount>;
  pairing?: ChannelPairingAdapter | ChatChannelPairingOptions;
  threading?: ChannelThreadingAdapter | ChatChannelThreadingOptions<TResolvedAccount>;
  outbound?: ChannelOutboundAdapter | ChatChannelAttachedOutboundOptions;
}): ChannelPlugin<TResolvedAccount, Probe, Audit> {
  return {
    ...params.base,
    ...(params.security ? { security: resolveChatChannelSecurity(params.security) } : {}),
    ...(params.pairing ? { pairing: resolveChatChannelPairing(params.pairing) } : {}),
    ...(params.threading ? { threading: resolveChatChannelThreading(params.threading) } : {}),
    ...(params.outbound ? { outbound: resolveChatChannelOutbound(params.outbound) } : {}),
  } as ChannelPlugin<TResolvedAccount, Probe, Audit>;
}

// --- Outbound session-route builders -------------------------------------
//
// Also carved from upstream `src/plugin-sdk/core.ts`: the two helpers a chat
// channel's `messaging.resolveOutboundSessionRoute` hook composes. Every
// dependency already exists in the fork (`buildOutboundBaseSessionKey`,
// `resolveThreadSessionKeys`, `parseThreadSessionSuffix`,
// `normalizeSessionKeyPreservingOpaquePeerIds`, `normalizeOutboundThreadId`);
// only the two composing wrappers were missing.

/**
 * Builds the canonical outbound session route payload returned by a channel's
 * `messaging.resolveOutboundSessionRoute` hook.
 */
export function buildChannelOutboundSessionRoute(params: {
  cfg: RemoteClawConfig;
  agentId: string;
  channel: string;
  accountId?: string | null;
  peer: RoutePeer;
  chatType: OutboundSessionRoute["chatType"];
  from: string;
  to: string;
  threadId?: string | number;
}): OutboundSessionRoute {
  const baseSessionKey = buildOutboundBaseSessionKey({
    cfg: params.cfg,
    agentId: params.agentId,
    channel: params.channel,
    accountId: params.accountId,
    peer: params.peer,
  });
  return {
    sessionKey: baseSessionKey,
    baseSessionKey,
    peer: params.peer,
    chatType: params.chatType,
    from: params.from,
    to: params.to,
    ...(params.threadId !== undefined ? { threadId: params.threadId } : {}),
  };
}

/** Candidate source used when choosing a thread id for outbound session routing. */
export type ThreadAwareOutboundSessionRouteThreadSource =
  | "replyToId"
  | "threadId"
  | "currentSession";

/** Recovery context passed before reusing the current session's thread id. */
export type ThreadAwareOutboundSessionRouteRecoveryContext = {
  route: OutboundSessionRoute;
  currentBaseSessionKey: string;
  currentThreadId: string;
};

/** Recovers the current thread id when the current session shares this base route. */
// Internal to the thread-aware route builder below. Upstream exports this, but
// the fork keeps unconsumed surface unexported — the same posture the bundled
// channel plugins document when they drop upstream fields they cannot back.
function recoverCurrentThreadSessionId(params: {
  route: OutboundSessionRoute;
  currentSessionKey?: string | null;
  canRecover?: (context: ThreadAwareOutboundSessionRouteRecoveryContext) => boolean;
}): string | undefined {
  const current = parseThreadSessionSuffix(params.currentSessionKey);
  if (!current.baseSessionKey || !current.threadId) {
    return undefined;
  }
  if (
    normalizeSessionKeyPreservingOpaquePeerIds(current.baseSessionKey) !==
    normalizeSessionKeyPreservingOpaquePeerIds(params.route.baseSessionKey)
  ) {
    return undefined;
  }
  const context = {
    route: params.route,
    currentBaseSessionKey: current.baseSessionKey,
    currentThreadId: current.threadId,
  };
  if (params.canRecover && !params.canRecover(context)) {
    return undefined;
  }
  return current.threadId;
}

function resolveThreadAwareOutboundCandidate(
  threadId?: string | number | null,
): { routeThreadId: string | number; sessionThreadId: string } | undefined {
  const sessionThreadId = normalizeOutboundThreadId(threadId);
  if (sessionThreadId === undefined) {
    return undefined;
  }
  return {
    routeThreadId: typeof threadId === "number" ? threadId : sessionThreadId,
    sessionThreadId,
  };
}

/** Adds thread-aware session keys and route thread ids to an outbound channel route. */
export function buildThreadAwareOutboundSessionRoute(params: {
  route: OutboundSessionRoute;
  replyToId?: string | number | null;
  threadId?: string | number | null;
  currentSessionKey?: string | null;
  precedence?: readonly ThreadAwareOutboundSessionRouteThreadSource[];
  useSuffix?: boolean;
  parentSessionKey?: string;
  normalizeThreadId?: (threadId: string) => string;
  canRecoverCurrentThread?: (context: ThreadAwareOutboundSessionRouteRecoveryContext) => boolean;
}): OutboundSessionRoute {
  const recoveredThreadId = recoverCurrentThreadSessionId({
    route: params.route,
    currentSessionKey: params.currentSessionKey,
    canRecover: params.canRecoverCurrentThread,
  });
  const candidates: Record<
    ThreadAwareOutboundSessionRouteThreadSource,
    { routeThreadId: string | number; sessionThreadId: string } | undefined
  > = {
    replyToId: resolveThreadAwareOutboundCandidate(params.replyToId),
    threadId: resolveThreadAwareOutboundCandidate(params.threadId),
    currentSession: resolveThreadAwareOutboundCandidate(recoveredThreadId),
  };
  const precedence = params.precedence ?? ["replyToId", "threadId", "currentSession"];
  const candidate = precedence.map((source) => candidates[source]).find(Boolean);
  const threadKeys = resolveThreadSessionKeys({
    baseSessionKey: params.route.baseSessionKey,
    threadId: candidate?.sessionThreadId,
    parentSessionKey: candidate ? params.parentSessionKey : undefined,
    useSuffix: params.useSuffix,
    normalizeThreadId: params.normalizeThreadId,
  });
  return {
    ...params.route,
    sessionKey: threadKeys.sessionKey,
    ...(candidate !== undefined ? { threadId: candidate.routeThreadId } : {}),
  };
}

// Shared base object for channel plugins that only need to override a few optional surfaces.
export function createChannelPluginBase<TResolvedAccount>(
  params: CreateChannelPluginBaseOptions<TResolvedAccount>,
): CreatedChannelPluginBase<TResolvedAccount> {
  return {
    id: params.id,
    meta: {
      ...resolveSdkChatChannelMeta(params.id),
      ...params.meta,
    },
    ...(params.capabilities ? { capabilities: params.capabilities } : {}),
    ...(params.commands ? { commands: params.commands } : {}),
    ...(params.agentPrompt ? { agentPrompt: params.agentPrompt } : {}),
    ...(params.streaming ? { streaming: params.streaming } : {}),
    ...(params.reload ? { reload: params.reload } : {}),
    ...(params.gatewayMethods ? { gatewayMethods: params.gatewayMethods } : {}),
    ...(params.configSchema ? { configSchema: params.configSchema } : {}),
    ...(params.config ? { config: params.config } : {}),
    ...(params.security ? { security: params.security } : {}),
    ...(params.groups ? { groups: params.groups } : {}),
    setup: params.setup,
  } as CreatedChannelPluginBase<TResolvedAccount>;
}
