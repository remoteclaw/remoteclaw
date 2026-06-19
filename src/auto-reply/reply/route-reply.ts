/**
 * Provider-agnostic reply router.
 *
 * Routes replies to the originating channel based on OriginatingChannel/OriginatingTo
 * instead of using the session's lastChannel. This ensures replies go back to the
 * provider where the message originated, even when the main session is shared
 * across multiple providers.
 */

import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveEffectiveMessagesConfig } from "../../agents/identity.js";
import { normalizeChannelId } from "../../channels/plugins/index.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveSilentReplyPolicy } from "../../config/silent-reply.js";
import { buildOutboundSessionContext } from "../../infra/outbound/session-context.js";
import { INTERNAL_MESSAGE_CHANNEL, normalizeMessageChannel } from "../../utils/message-channel.js";
import type { OriginatingChannelType } from "../templating.js";
import { isSilentReplyPayloadText, SILENT_REPLY_TOKEN } from "../tokens.js";
import type { ReplyPayload } from "../types.js";
import { normalizeReplyPayload } from "./normalize-reply.js";
import { shouldSuppressReasoningPayload } from "./reply-payloads.js";

let deliverRuntimePromise: Promise<
  typeof import("../../infra/outbound/deliver-runtime.js")
> | null = null;

function loadDeliverRuntime() {
  deliverRuntimePromise ??= import("../../infra/outbound/deliver-runtime.js");
  return deliverRuntimePromise;
}

export type RouteReplyParams = {
  /** The reply payload to send. */
  payload: ReplyPayload;
  /** The originating channel type. */
  channel: OriginatingChannelType;
  /** The destination chat/channel/user ID. */
  to: string;
  /** Session key for deriving agent identity defaults (multi-agent). */
  sessionKey?: string;
  /** Session key for policy resolution when native-command delivery targets a different session. */
  policySessionKey?: string;
  /** Provider account id (multi-account). */
  accountId?: string;
  /** Thread id for replies (Telegram topic id or Matrix thread event id). */
  threadId?: string | number;
  /** Config for provider-specific settings. */
  cfg: RemoteClawConfig;
  /** Optional abort signal for cooperative cancellation. */
  abortSignal?: AbortSignal;
  /** Mirror reply into session transcript (default: true when sessionKey is set). */
  mirror?: boolean;
  /** Whether this message is being sent in a group/channel context */
  isGroup?: boolean;
  /** Group or channel identifier for correlation with received events */
  groupId?: string;
};

export type RouteReplyResult = {
  /** Whether the reply was sent successfully. */
  ok: boolean;
  /** Optional message ID from the provider. */
  messageId?: string;
  /** Error message if the send failed. */
  error?: string;
};

/**
 * Routes a reply payload to the specified channel.
 *
 * This function provides a unified interface for sending messages to any
 * supported provider. It's used by the followup queue to route replies
 * back to the originating channel when OriginatingChannel/OriginatingTo
 * are set.
 */
export async function routeReply(params: RouteReplyParams): Promise<RouteReplyResult> {
  const { payload, channel, to, accountId, threadId, cfg, abortSignal } = params;
  if (shouldSuppressReasoningPayload(payload)) {
    return { ok: true };
  }
  const normalizedChannel = normalizeMessageChannel(channel);
  const channelId = normalizeChannelId(channel) ?? null;
  const resolvedAgentId = params.sessionKey
    ? resolveSessionAgentId({
        sessionKey: params.sessionKey,
        config: cfg,
      })
    : undefined;

  // Debug: `pnpm test src/auto-reply/reply/route-reply.test.ts`
  const responsePrefix = params.sessionKey
    ? resolveEffectiveMessagesConfig(
        cfg,
        resolvedAgentId ?? resolveSessionAgentId({ config: cfg }),
        {
          channel: normalizedChannel,
          accountId,
        },
      ).responsePrefix
    : cfg.messages?.responsePrefix === "auto"
      ? undefined
      : cfg.messages?.responsePrefix;
  // Silent-reply policy: when silence is disallowed on this surface, preserve the
  // exact NO_REPLY token through normalization (instead of letting
  // normalizeReplyPayload coerce/strip it). The fork drops the preserved token at
  // the empty-reply skip below — the v4.20 rewrite-into-visible-text half of this
  // feature lives in the reply-dispatcher path and is not yet wired here.
  const policySessionKey = params.policySessionKey ?? params.sessionKey;
  const shouldPreserveSilentPayload =
    isSilentReplyPayloadText(payload.text) &&
    resolveSilentReplyPolicy({
      cfg,
      sessionKey: policySessionKey,
      surface: channelId ?? String(channel),
    }) !== "allow";
  const normalized = shouldPreserveSilentPayload
    ? { ...payload, text: payload.text?.trim() || SILENT_REPLY_TOKEN }
    : normalizeReplyPayload(payload, {
        responsePrefix,
      });
  if (!normalized) {
    return { ok: true };
  }

  let text = normalized.text ?? "";
  let mediaUrls = (normalized.mediaUrls?.filter(Boolean) ?? []).length
    ? (normalized.mediaUrls?.filter(Boolean) as string[])
    : normalized.mediaUrl
      ? [normalized.mediaUrl]
      : [];
  const replyToId = normalized.replyToId;

  // Skip empty replies, and exact silent tokens preserved above for a
  // silence-disallowed surface (dropped here until the rewrite-to-visible half
  // is wired — see the silent-reply policy note above).
  if ((!text.trim() || isSilentReplyPayloadText(text)) && mediaUrls.length === 0) {
    return { ok: true };
  }

  if (channel === INTERNAL_MESSAGE_CHANNEL) {
    return {
      ok: false,
      error: "Webchat routing not supported for queued replies",
    };
  }

  if (!channelId) {
    return { ok: false, error: `Unknown channel: ${String(channel)}` };
  }
  if (abortSignal?.aborted) {
    return { ok: false, error: "Reply routing aborted" };
  }

  const resolvedReplyToId =
    replyToId ??
    (channelId === "slack" && threadId != null && threadId !== "" ? String(threadId) : undefined);
  const resolvedThreadId = channelId === "slack" ? null : (threadId ?? null);

  try {
    // Provider docking: this is an execution boundary (we're about to send).
    // Keep the module cheap to import by loading outbound plumbing lazily.
    const { deliverOutboundPayloads } = await loadDeliverRuntime();
    const outboundSession = buildOutboundSessionContext({
      cfg,
      agentId: resolvedAgentId,
      sessionKey: params.sessionKey,
    });
    const results = await deliverOutboundPayloads({
      cfg,
      channel: channelId,
      to,
      accountId: accountId ?? undefined,
      payloads: [normalized],
      replyToId: resolvedReplyToId ?? null,
      threadId: resolvedThreadId,
      session: outboundSession,
      abortSignal,
      mirror:
        params.mirror !== false && params.sessionKey
          ? {
              sessionKey: params.sessionKey,
              agentId: resolvedAgentId,
              text,
              mediaUrls,
              ...(params.isGroup != null ? { isGroup: params.isGroup } : {}),
              ...(params.groupId ? { groupId: params.groupId } : {}),
            }
          : undefined,
    });

    const last = results.at(-1);
    return { ok: true, messageId: last?.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to route reply to ${channel}: ${message}`,
    };
  }
}

/**
 * Checks if a channel type is routable via routeReply.
 *
 * Some channels (webchat) require special handling and cannot be routed through
 * this generic interface.
 */
export function isRoutableChannel(
  channel: OriginatingChannelType | undefined,
): channel is Exclude<OriginatingChannelType, typeof INTERNAL_MESSAGE_CHANNEL> {
  if (!channel || channel === INTERNAL_MESSAGE_CHANNEL) {
    return false;
  }
  return normalizeChannelId(channel) !== null;
}
