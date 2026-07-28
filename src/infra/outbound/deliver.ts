import type { sendMessageDiscord } from "../../../extensions/discord/src/send.js";
import type { sendMessageIMessage } from "../../../extensions/imessage/src/send.js";
import {
  markdownToSignalTextChunks,
  type SignalTextStyleRange,
} from "../../../extensions/signal/src/format.js";
import { sendMessageSignal } from "../../../extensions/signal/src/send.js";
import type { sendMessageSlack } from "../../../extensions/slack/src/send.js";
import type { sendMessageTelegram } from "../../../extensions/telegram/src/send.js";
import type { sendMessageWhatsApp } from "../../../extensions/whatsapp/src/outbound.js";
import {
  chunkByParagraph,
  chunkMarkdownTextWithMode,
  resolveChunkMode,
  resolveTextChunkLimit,
} from "../../auto-reply/chunk.js";
import type { ReplyPayload } from "../../auto-reply/types.js";
import { resolveChannelMediaMaxBytes } from "../../channels/plugins/media-limits.js";
import { loadChannelOutboundAdapter } from "../../channels/plugins/outbound/load.js";
import type {
  ChannelOutboundAdapter,
  ChannelOutboundContext,
} from "../../channels/plugins/types.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveMarkdownTableMode } from "../../config/markdown-tables.js";
import {
  appendAssistantMessageToSessionTranscript,
  resolveMirroredTranscriptText,
} from "../../config/sessions.js";
import { fireAndForgetHook } from "../../hooks/fire-and-forget.js";
import { createInternalHookEvent, triggerInternalHook } from "../../hooks/internal-hooks.js";
import {
  buildCanonicalSentMessageHookContext,
  toInternalMessageSentContext,
  toPluginMessageContext,
  toPluginMessageSentEvent,
} from "../../hooks/message-hook-mappers.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getAgentScopedMediaLocalRoots } from "../../media/local-roots.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { throwIfAborted } from "./abort.js";
import { annotateDeliveredBeforeFailure } from "./delivered-before-failure.js";
import {
  ackDelivery,
  enqueueDelivery,
  failDelivery,
  failPartialDelivery,
  failUnknownDelivery,
  markDeliveryAttemptStarted,
  withActiveDeliveryClaim,
} from "./delivery-queue.js";
import { describeDeliveryError } from "./describe-delivery-error.js";
import type { OutboundIdentity } from "./identity.js";
import type { NormalizedOutboundPayload } from "./payloads.js";
import { normalizeReplyPayloadsForDelivery } from "./payloads.js";
import { isPlainTextSurface, sanitizeForPlainText } from "./sanitize-text.js";
import { didSendDefinitelyNotLand } from "./send-outcome.js";
import type { OutboundSessionContext } from "./session-context.js";
import type { OutboundChannel } from "./targets.js";

export type { NormalizedOutboundPayload } from "./payloads.js";
export { normalizeOutboundPayloads } from "./payloads.js";

const log = createSubsystemLogger("outbound/deliver");
const TELEGRAM_TEXT_LIMIT = 4096;

type SendMatrixMessage = (
  to: string,
  text: string,
  opts?: {
    cfg?: RemoteClawConfig;
    mediaUrl?: string;
    replyToId?: string;
    threadId?: string;
    timeoutMs?: number;
  },
) => Promise<{ messageId: string; roomId: string }>;

export type OutboundSendDeps = {
  sendWhatsApp?: typeof sendMessageWhatsApp;
  sendTelegram?: typeof sendMessageTelegram;
  sendDiscord?: typeof sendMessageDiscord;
  sendSlack?: typeof sendMessageSlack;
  sendSignal?: typeof sendMessageSignal;
  sendIMessage?: typeof sendMessageIMessage;
  sendMatrix?: SendMatrixMessage;
  sendMSTeams?: (
    to: string,
    text: string,
    opts?: { mediaUrl?: string; mediaLocalRoots?: readonly string[] },
  ) => Promise<{ messageId: string; conversationId: string }>;
};

export type OutboundDeliveryResult = {
  channel: Exclude<OutboundChannel, "none">;
  messageId: string;
  chatId?: string;
  channelId?: string;
  roomId?: string;
  conversationId?: string;
  timestamp?: number;
  toJid?: string;
  pollId?: string;
  // Channel docking: stash channel-specific fields here to avoid core type churn.
  meta?: Record<string, unknown>;
};

type Chunker = (text: string, limit: number) => string[];

type ChannelHandler = {
  chunker: Chunker | null;
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;
  supportsMedia: boolean;
  sendPayload?: (
    payload: ReplyPayload,
    overrides?: {
      replyToId?: string | null;
      threadId?: string | number | null;
    },
  ) => Promise<OutboundDeliveryResult>;
  sendText: (
    text: string,
    overrides?: {
      replyToId?: string | null;
      threadId?: string | number | null;
    },
  ) => Promise<OutboundDeliveryResult>;
  sendMedia: (
    caption: string,
    mediaUrl: string,
    overrides?: {
      replyToId?: string | null;
      threadId?: string | number | null;
    },
  ) => Promise<OutboundDeliveryResult>;
};

type ChannelHandlerParams = {
  cfg: RemoteClawConfig;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  replyToId?: string | null;
  threadId?: string | number | null;
  identity?: OutboundIdentity;
  deps?: OutboundSendDeps;
  gifPlayback?: boolean;
  silent?: boolean;
  mediaLocalRoots?: readonly string[];
};

// Channel docking: outbound delivery delegates to plugin.outbound adapters.
async function createChannelHandler(params: ChannelHandlerParams): Promise<ChannelHandler> {
  const outbound = await loadChannelOutboundAdapter(params.channel);
  const handler = createPluginHandler({ ...params, outbound });
  if (!handler) {
    throw new Error(`Outbound not configured for channel: ${params.channel}`);
  }
  return handler;
}

function createPluginHandler(
  params: ChannelHandlerParams & { outbound?: ChannelOutboundAdapter },
): ChannelHandler | null {
  const outbound = params.outbound;
  if (!outbound?.sendText) {
    return null;
  }
  const baseCtx = createChannelOutboundContextBase(params);
  const sendText = outbound.sendText;
  const sendMedia = outbound.sendMedia;
  const chunker = outbound.chunker ?? null;
  const chunkerMode = outbound.chunkerMode;
  const resolveCtx = (overrides?: {
    replyToId?: string | null;
    threadId?: string | number | null;
  }): Omit<ChannelOutboundContext, "text" | "mediaUrl"> => ({
    ...baseCtx,
    replyToId: overrides?.replyToId ?? baseCtx.replyToId,
    threadId: overrides?.threadId ?? baseCtx.threadId,
  });
  return {
    chunker,
    chunkerMode,
    textChunkLimit: outbound.textChunkLimit,
    supportsMedia: Boolean(sendMedia),
    sendPayload: outbound.sendPayload
      ? async (payload, overrides) =>
          outbound.sendPayload!({
            ...resolveCtx(overrides),
            text: payload.text ?? "",
            mediaUrl: payload.mediaUrl,
            payload,
          })
      : undefined,
    sendText: async (text, overrides) =>
      sendText({
        ...resolveCtx(overrides),
        text,
      }),
    sendMedia: async (caption, mediaUrl, overrides) => {
      if (sendMedia) {
        return sendMedia({
          ...resolveCtx(overrides),
          text: caption,
          mediaUrl,
        });
      }
      return sendText({
        ...resolveCtx(overrides),
        text: caption,
      });
    },
  };
}

function createChannelOutboundContextBase(
  params: ChannelHandlerParams,
): Omit<ChannelOutboundContext, "text" | "mediaUrl"> {
  return {
    cfg: params.cfg,
    to: params.to,
    accountId: params.accountId,
    replyToId: params.replyToId,
    threadId: params.threadId,
    identity: params.identity,
    gifPlayback: params.gifPlayback,
    deps: params.deps,
    silent: params.silent,
    mediaLocalRoots: params.mediaLocalRoots,
  };
}

const isAbortError = (err: unknown): boolean => err instanceof Error && err.name === "AbortError";

type DeliverOutboundPayloadsCoreParams = {
  cfg: RemoteClawConfig;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  payloads: ReplyPayload[];
  replyToId?: string | null;
  threadId?: string | number | null;
  identity?: OutboundIdentity;
  deps?: OutboundSendDeps;
  gifPlayback?: boolean;
  abortSignal?: AbortSignal;
  bestEffort?: boolean;
  onError?: (err: unknown, payload: NormalizedOutboundPayload) => void;
  onPayload?: (payload: NormalizedOutboundPayload) => void;
  /** Session/agent context used for hooks and media local-root scoping. */
  session?: OutboundSessionContext;
  mirror?: {
    sessionKey: string;
    agentId?: string;
    text?: string;
    mediaUrls?: string[];
    /** Whether this message is being sent in a group/channel context */
    isGroup?: boolean;
    /** Group or channel identifier for correlation with received events */
    groupId?: string;
  };
  silent?: boolean;
};

type DeliverOutboundPayloadsParams = DeliverOutboundPayloadsCoreParams & {
  /** @internal Skip write-ahead queue (used by crash-recovery to avoid re-enqueueing). */
  skipQueue?: boolean;
};

type MessageSentEvent = {
  success: boolean;
  content: string;
  error?: string;
  messageId?: string;
};

function hasMediaPayload(payload: ReplyPayload): boolean {
  return Boolean(payload.mediaUrl) || (payload.mediaUrls?.length ?? 0) > 0;
}

function hasChannelDataPayload(payload: ReplyPayload): boolean {
  return Boolean(payload.channelData && Object.keys(payload.channelData).length > 0);
}

function normalizePayloadForChannelDelivery(
  payload: ReplyPayload,
  channelId: string,
): ReplyPayload | null {
  const hasMedia = hasMediaPayload(payload);
  const hasChannelData = hasChannelDataPayload(payload);
  const rawText = typeof payload.text === "string" ? payload.text : "";
  const normalizedText =
    channelId === "whatsapp" ? rawText.replace(/^(?:[ \t]*\r?\n)+/, "") : rawText;
  if (!normalizedText.trim()) {
    if (!hasMedia && !hasChannelData) {
      return null;
    }
    return {
      ...payload,
      text: "",
    };
  }
  if (normalizedText === rawText) {
    return payload;
  }
  return {
    ...payload,
    text: normalizedText,
  };
}

function normalizePayloadsForChannelDelivery(
  payloads: ReplyPayload[],
  channel: Exclude<OutboundChannel, "none">,
  _cfg: RemoteClawConfig,
  _to: string,
  _accountId?: string,
): ReplyPayload[] {
  const normalizedPayloads: ReplyPayload[] = [];
  for (const payload of normalizeReplyPayloadsForDelivery(payloads)) {
    let sanitizedPayload = payload;
    // Strip HTML tags for plain-text surfaces (WhatsApp, Signal, etc.)
    // Models occasionally produce <br>, <b>, etc. that render as literal text.
    // See https://github.com/remoteclaw/remoteclaw/issues/31884
    if (isPlainTextSurface(channel) && sanitizedPayload.text) {
      // Telegram sendPayload uses textMode:"html". Preserve raw HTML in this path.
      if (!(channel === "telegram" && sanitizedPayload.channelData)) {
        sanitizedPayload = {
          ...sanitizedPayload,
          text: sanitizeForPlainText(sanitizedPayload.text),
        };
      }
    }
    const normalized = normalizePayloadForChannelDelivery(sanitizedPayload, channel);
    if (normalized) {
      normalizedPayloads.push(normalized);
    }
  }
  return normalizedPayloads;
}

function buildPayloadSummary(payload: ReplyPayload): NormalizedOutboundPayload {
  return {
    text: payload.text ?? "",
    mediaUrls: payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []),
    channelData: payload.channelData,
  };
}

function createMessageSentEmitter(params: {
  hookRunner: ReturnType<typeof getGlobalHookRunner>;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  sessionKeyForInternalHooks?: string;
  mirrorIsGroup?: boolean;
  mirrorGroupId?: string;
}): { emitMessageSent: (event: MessageSentEvent) => void; hasMessageSentHooks: boolean } {
  const hasMessageSentHooks = params.hookRunner?.hasHooks("message_sent") ?? false;
  const canEmitInternalHook = Boolean(params.sessionKeyForInternalHooks);
  const emitMessageSent = (event: MessageSentEvent) => {
    if (!hasMessageSentHooks && !canEmitInternalHook) {
      return;
    }
    const canonical = buildCanonicalSentMessageHookContext({
      to: params.to,
      content: event.content,
      success: event.success,
      error: event.error,
      channelId: params.channel,
      accountId: params.accountId ?? undefined,
      conversationId: params.to,
      messageId: event.messageId,
      isGroup: params.mirrorIsGroup,
      groupId: params.mirrorGroupId,
    });
    if (hasMessageSentHooks) {
      fireAndForgetHook(
        params.hookRunner!.runMessageSent(
          toPluginMessageSentEvent(canonical),
          toPluginMessageContext(canonical),
        ),
        "deliverOutboundPayloads: message_sent plugin hook failed",
        (message) => {
          log.warn(message);
        },
      );
    }
    if (!canEmitInternalHook) {
      return;
    }
    fireAndForgetHook(
      triggerInternalHook(
        createInternalHookEvent(
          "message",
          "sent",
          params.sessionKeyForInternalHooks!,
          toInternalMessageSentContext(canonical),
        ),
      ),
      "deliverOutboundPayloads: message:sent internal hook failed",
      (message) => {
        log.warn(message);
      },
    );
  };
  return { emitMessageSent, hasMessageSentHooks };
}

async function applyMessageSendingHook(params: {
  hookRunner: ReturnType<typeof getGlobalHookRunner>;
  enabled: boolean;
  payload: ReplyPayload;
  payloadSummary: NormalizedOutboundPayload;
  to: string;
  channel: Exclude<OutboundChannel, "none">;
  accountId?: string;
}): Promise<{
  cancelled: boolean;
  payload: ReplyPayload;
  payloadSummary: NormalizedOutboundPayload;
}> {
  if (!params.enabled) {
    return {
      cancelled: false,
      payload: params.payload,
      payloadSummary: params.payloadSummary,
    };
  }
  try {
    const sendingResult = await params.hookRunner!.runMessageSending(
      {
        to: params.to,
        content: params.payloadSummary.text,
        metadata: {
          channel: params.channel,
          accountId: params.accountId,
          mediaUrls: params.payloadSummary.mediaUrls,
        },
      },
      {
        channelId: params.channel,
        accountId: params.accountId ?? undefined,
      },
    );
    if (sendingResult?.cancel) {
      return {
        cancelled: true,
        payload: params.payload,
        payloadSummary: params.payloadSummary,
      };
    }
    if (sendingResult?.content == null) {
      return {
        cancelled: false,
        payload: params.payload,
        payloadSummary: params.payloadSummary,
      };
    }
    const payload = {
      ...params.payload,
      text: sendingResult.content,
    };
    return {
      cancelled: false,
      payload,
      payloadSummary: {
        ...params.payloadSummary,
        text: sendingResult.content,
      },
    };
  } catch {
    // Don't block delivery on hook failure.
    return {
      cancelled: false,
      payload: params.payload,
      payloadSummary: params.payloadSummary,
    };
  }
}

export async function deliverOutboundPayloads(
  params: DeliverOutboundPayloadsParams,
): Promise<OutboundDeliveryResult[]> {
  const { channel, to, payloads } = params;

  // Write-ahead delivery queue: persist before sending, remove after success.
  const queueId = params.skipQueue
    ? null
    : await enqueueDelivery({
        channel,
        to,
        accountId: params.accountId,
        payloads,
        threadId: params.threadId,
        replyToId: params.replyToId,
        bestEffort: params.bestEffort,
        gifPlayback: params.gifPlayback,
        silent: params.silent,
        mirror: params.mirror,
      }).catch(() => null); // Best-effort — don't block delivery if queue write fails.

  // Wrap onError to detect per-payload failures under bestEffort mode.
  // When bestEffort is true, per-payload errors are caught and passed to onError
  // without throwing — so the outer try/catch never fires. We track whether any
  // payload failed so we can record a failure instead of acking.
  //
  // Wrapped unconditionally, not only when the caller passed an onError: whether
  // a send failed is a property of the send, not of the caller's callback wiring.
  // Gating on `params.onError` made a bestEffort caller that supplies no callback
  // (server-node-events, server-restart-sentinel, the message command) ack an
  // entry whose payloads all failed — silently dropping the message.
  let hadPayloadFailure = false;
  let firstPayloadError: string | undefined;

  // The core fills this as each payload lands, so the queue bookkeeping below
  // can tell "nothing reached the recipient" (safe to replay whole) from "some
  // of it did" (replaying duplicates what already arrived) — including when the
  // core throws part-way and never returns its results. Chunked text makes this
  // ordinary, not exotic: chunk 1 can land and chunk 2 throw.
  const landed: OutboundDeliveryResult[] = [];

  // `landed` records sends that RESOLVED. This records that one was ENTERED.
  // The two answer different questions, and the failure path needs both: a throw
  // with nothing landed is safe to replay only if no send ever reached the
  // transport (#3051 item 1). The core owns the writes; see `attemptPlatformSend`.
  const sendProgress: PlatformSendProgress = { platformSendAttempted: false };

  // Whether ANY payload under bestEffort failed in a way that might have landed.
  // OR-accumulated rather than taken from the first error: a clean ECONNREFUSED
  // on payload 1 would otherwise mask an ambiguous post-transmission timeout on
  // payload 2, clearing the marker and replaying the payload that may have
  // arrived. Classified at failure time, when `platformSendAttempted` reflects
  // exactly the sends made before THAT payload's error.
  let sawAmbiguousPayloadFailure = false;
  const wrappedParams = {
    ...params,
    onError: (err: unknown, payload: NormalizedOutboundPayload) => {
      hadPayloadFailure = true;
      const described = describeDeliveryError(err);
      sawAmbiguousPayloadFailure ||= !didSendDefinitelyNotLand({
        platformSendAttempted: sendProgress.platformSendAttempted,
        error: err,
        describedError: described,
      });
      // Keep the cause: "partial delivery failure (bestEffort)" alone tells an
      // operator triaging the entry nothing about why it failed.
      firstPayloadError ??= described;
      params.onError?.(err, payload);
    },
  };

  const recordQueueFailure = async (
    error: string,
    definitelyDidNotLand: boolean,
  ): Promise<void> => {
    if (!queueId) {
      return;
    }
    if (landed.length > 0) {
      // Pass the count: it is the only record of how far the send got, and the
      // operator who opens the quarantined entry otherwise sees the full payload
      // list with no way to tell which part arrived.
      await failPartialDelivery(queueId, error, undefined, landed.length).catch(() => {});
      return;
    }
    if (definitelyDidNotLand) {
      await failDelivery(queueId, error).catch(() => {});
      return;
    }
    // A send reached the transport and then failed without reporting anything
    // landed. That is not "nothing arrived" — it is "we cannot tell", and
    // replaying it is how the recipient gets the message twice. Surface it for
    // an operator instead of silently re-sending (#3051 item 1). This BOUNDS the
    // duplicate window; it does not close it.
    await failUnknownDelivery(queueId, error).catch(() => {});
    // Say so at the moment of the decision. The entry only MOVES to
    // `needs-review/` on the next gateway start, so without this line a message
    // whose outcome is undetermined is invisible until then — on a long-running
    // gateway, indefinitely. "Surfaced for review" has to mean surfaced now.
    log.warn(
      "deliverOutboundPayloads: send outcome is unknown — the message may or may not have been delivered. It will NOT be retried automatically; it is held for manual reconciliation and moves to delivery-queue/needs-review/ on the next gateway start",
      { channel, to, queueId, error },
    );
  };

  const runDelivery = async (): Promise<OutboundDeliveryResult[]> => {
    try {
      const results = await deliverOutboundPayloadsCore(wrappedParams, landed, sendProgress);
      if (queueId) {
        if (hadPayloadFailure) {
          await recordQueueFailure(
            `partial delivery failure (bestEffort): ${firstPayloadError ?? "unknown error"}`,
            !sawAmbiguousPayloadFailure,
          );
        } else {
          await ackDelivery(queueId).catch(() => {}); // Best-effort cleanup.
        }
      }
      return results;
    } catch (err) {
      if (queueId) {
        // Acking discards the entry outright — no retry, no failed/, no
        // needs-review — so it is only correct when the CALLER cancelled and
        // nothing reached the recipient. `isAbortError` is name-based, and a
        // transport timeout that aborts its own AbortController surfaces a
        // DOMException named "AbortError" (BlueBubbles does exactly this): that
        // is an unknown send outcome, not a cancellation, and acking it would
        // silently drop the message. A caller-cancelled send that already
        // landed part of its payloads is likewise not a clean discard.
        const cancelledByCaller = isAbortError(err) && params.abortSignal?.aborted === true;
        if (cancelledByCaller && landed.length === 0) {
          await ackDelivery(queueId).catch(() => {});
        } else {
          const described = describeDeliveryError(err);
          await recordQueueFailure(
            described,
            didSendDefinitelyNotLand({
              platformSendAttempted: sendProgress.platformSendAttempted,
              error: err,
              describedError: described,
            }),
          );
        }
      }
      // Tell whoever catches this how far the send got. Crash recovery calls
      // this function with skipQueue set, so it owns its own queue bookkeeping
      // and has no other way to tell a total failure (safe to replay whole)
      // from a partial one (replaying duplicates what already arrived).
      throw annotateDeliveredBeforeFailure(err, landed.length);
    }
  };

  if (!queueId) {
    return await runDelivery();
  }

  // Hold a single-owner claim for the whole send, so a crash-recovery pass
  // running concurrently cannot drive the same queue entry, and stamp the entry
  // as "send in flight" so an interrupted send is quarantined rather than
  // blind-replayed on the next startup (#2934).
  const claim = await withActiveDeliveryClaim(queueId, async () => {
    try {
      await markDeliveryAttemptStarted(queueId);
    } catch (err) {
      // Degrade to the pre-marker replay behaviour rather than block the send —
      // but say so, or an operator cannot tell that duplicate suppression is
      // disarmed for this message.
      log.warn(
        "deliverOutboundPayloads: could not record the send-in-flight marker; if this process dies mid-send the message may be delivered twice",
        { channel, to, queueId, error: describeDeliveryError(err) },
      );
    }
    return await runDelivery();
  });
  if (claim.status === "claimed") {
    return claim.value;
  }
  // Unreachable today, and the reason is narrow: there is no `await` between
  // enqueueDelivery resolving above and the claim being taken, so no recovery
  // pass can interleave and grab this freshly-minted id. Do not insert one.
  // Throwing rather than returning [] keeps this loud if that ever changes —
  // most callers ignore the result array, so an empty return would read as a
  // successful send of a message that was never sent.
  throw new Error(
    `Delivery queue entry ${queueId} is already owned by another delivery worker — refusing to send it twice`,
  );
}

/**
 * Whether any platform send call was entered, shared by reference with the queue
 * wrapper so it survives this function throwing part-way.
 */
type PlatformSendProgress = { platformSendAttempted: boolean };

/**
 * Core delivery logic (extracted for queue wrapper).
 *
 * `results` and `progress` are accepted from the caller — required, not
 * defaulted — rather than created here, so the queue wrapper still sees which
 * payloads landed and whether the transport was ever reached when this function
 * throws part-way. A default would silently let a future caller drop that wiring
 * and lose the signal.
 */
async function deliverOutboundPayloadsCore(
  params: DeliverOutboundPayloadsCoreParams,
  results: OutboundDeliveryResult[],
  progress: PlatformSendProgress,
): Promise<OutboundDeliveryResult[]> {
  const { cfg, channel, to, payloads } = params;

  /**
   * Every platform send goes through here, so "did anything reach the transport?"
   * has exactly one place to be recorded. The flag is set BEFORE the await: the
   * question is whether the request was issued, not whether it came back.
   *
   * A new send path that calls the handler directly instead of through this
   * helper silently re-opens the ambiguous-error replay window (#3051 item 1) —
   * its failures would look like "never left the process" and be replayed.
   */
  const attemptPlatformSend = async <T>(send: () => Promise<T>): Promise<T> => {
    progress.platformSendAttempted = true;
    return await send();
  };
  const accountId = params.accountId;
  const deps = params.deps;
  const abortSignal = params.abortSignal;
  const sendSignal = params.deps?.sendSignal ?? sendMessageSignal;
  const mediaLocalRoots = getAgentScopedMediaLocalRoots(
    cfg,
    params.session?.agentId ?? params.mirror?.agentId,
  );
  const handler = await createChannelHandler({
    cfg,
    channel,
    to,
    deps,
    accountId,
    replyToId: params.replyToId,
    threadId: params.threadId,
    identity: params.identity,
    gifPlayback: params.gifPlayback,
    silent: params.silent,
    mediaLocalRoots,
  });
  const configuredTextLimit = handler.chunker
    ? resolveTextChunkLimit(cfg, channel, accountId, {
        fallbackLimit: handler.textChunkLimit,
      })
    : undefined;
  const textLimit =
    channel === "telegram" && typeof configuredTextLimit === "number"
      ? Math.min(configuredTextLimit, TELEGRAM_TEXT_LIMIT)
      : configuredTextLimit;
  const chunkMode = handler.chunker ? resolveChunkMode(cfg, channel, accountId) : "length";
  const isSignalChannel = channel === "signal";
  const signalTableMode = isSignalChannel
    ? resolveMarkdownTableMode({ cfg, channel: "signal", accountId })
    : "code";
  const signalMaxBytes = isSignalChannel
    ? resolveChannelMediaMaxBytes({
        cfg,
        resolveChannelLimitMb: ({ cfg, accountId }) =>
          cfg.channels?.signal?.accounts?.[accountId]?.mediaMaxMb ??
          cfg.channels?.signal?.mediaMaxMb,
        accountId,
      })
    : undefined;

  const sendTextChunks = async (
    text: string,
    overrides?: { replyToId?: string | null; threadId?: string | number | null },
  ) => {
    throwIfAborted(abortSignal);
    if (!handler.chunker || textLimit === undefined) {
      results.push(await attemptPlatformSend(() => handler.sendText(text, overrides)));
      return;
    }
    if (chunkMode === "newline") {
      const mode = handler.chunkerMode ?? "text";
      const blockChunks =
        mode === "markdown"
          ? chunkMarkdownTextWithMode(text, textLimit, "newline")
          : chunkByParagraph(text, textLimit);

      if (!blockChunks.length && text) {
        blockChunks.push(text);
      }
      for (const blockChunk of blockChunks) {
        const chunks = handler.chunker(blockChunk, textLimit);
        if (!chunks.length && blockChunk) {
          chunks.push(blockChunk);
        }
        for (const chunk of chunks) {
          throwIfAborted(abortSignal);
          results.push(await attemptPlatformSend(() => handler.sendText(chunk, overrides)));
        }
      }
      return;
    }
    const chunks = handler.chunker(text, textLimit);
    for (const chunk of chunks) {
      throwIfAborted(abortSignal);
      results.push(await attemptPlatformSend(() => handler.sendText(chunk, overrides)));
    }
  };

  const sendSignalText = async (text: string, styles: SignalTextStyleRange[]) => {
    throwIfAborted(abortSignal);
    return {
      channel: "signal" as const,
      ...(await attemptPlatformSend(() =>
        sendSignal(to, text, {
          cfg,
          maxBytes: signalMaxBytes,
          accountId: accountId ?? undefined,
          textMode: "plain",
          textStyles: styles,
        }),
      )),
    };
  };

  const sendSignalTextChunks = async (text: string) => {
    throwIfAborted(abortSignal);
    let signalChunks =
      textLimit === undefined
        ? markdownToSignalTextChunks(text, Number.POSITIVE_INFINITY, {
            tableMode: signalTableMode,
          })
        : markdownToSignalTextChunks(text, textLimit, { tableMode: signalTableMode });
    if (signalChunks.length === 0 && text) {
      signalChunks = [{ text, styles: [] }];
    }
    for (const chunk of signalChunks) {
      throwIfAborted(abortSignal);
      results.push(await sendSignalText(chunk.text, chunk.styles));
    }
  };

  const sendSignalMedia = async (caption: string, mediaUrl: string) => {
    throwIfAborted(abortSignal);
    const formatted = markdownToSignalTextChunks(caption, Number.POSITIVE_INFINITY, {
      tableMode: signalTableMode,
    })[0] ?? {
      text: caption,
      styles: [],
    };
    return {
      channel: "signal" as const,
      ...(await attemptPlatformSend(() =>
        sendSignal(to, formatted.text, {
          cfg,
          mediaUrl,
          maxBytes: signalMaxBytes,
          accountId: accountId ?? undefined,
          textMode: "plain",
          textStyles: formatted.styles,
          mediaLocalRoots,
        }),
      )),
    };
  };
  const normalizedPayloads = normalizePayloadsForChannelDelivery(
    payloads,
    channel,
    cfg,
    to,
    accountId,
  );
  const hookRunner = getGlobalHookRunner();
  const sessionKeyForInternalHooks = params.mirror?.sessionKey ?? params.session?.key;
  const mirrorIsGroup = params.mirror?.isGroup;
  const mirrorGroupId = params.mirror?.groupId;
  const { emitMessageSent, hasMessageSentHooks } = createMessageSentEmitter({
    hookRunner,
    channel,
    to,
    accountId,
    sessionKeyForInternalHooks,
    mirrorIsGroup,
    mirrorGroupId,
  });
  const hasMessageSendingHooks = hookRunner?.hasHooks("message_sending") ?? false;
  if (hasMessageSentHooks && params.session?.agentId && !sessionKeyForInternalHooks) {
    log.warn(
      "deliverOutboundPayloads: session.agentId present without session key; internal message:sent hook will be skipped",
      {
        channel,
        to,
        agentId: params.session.agentId,
      },
    );
  }
  for (const payload of normalizedPayloads) {
    let payloadSummary = buildPayloadSummary(payload);
    try {
      throwIfAborted(abortSignal);

      // Run message_sending plugin hook (may modify content or cancel)
      const hookResult = await applyMessageSendingHook({
        hookRunner,
        enabled: hasMessageSendingHooks,
        payload,
        payloadSummary,
        to,
        channel,
        accountId,
      });
      if (hookResult.cancelled) {
        continue;
      }
      const effectivePayload = hookResult.payload;
      payloadSummary = hookResult.payloadSummary;

      params.onPayload?.(payloadSummary);
      const sendOverrides = {
        replyToId: effectivePayload.replyToId ?? params.replyToId ?? undefined,
        threadId: params.threadId ?? undefined,
      };
      // Bound to a local so the send closure keeps the optional-property
      // narrowing from this branch. `createPluginHandler` builds every handler
      // method as a closure, so there is no `this` to lose.
      const sendPayload = handler.sendPayload;
      if (sendPayload && effectivePayload.channelData) {
        const delivery = await attemptPlatformSend(() =>
          sendPayload(effectivePayload, sendOverrides),
        );
        results.push(delivery);
        emitMessageSent({
          success: true,
          content: payloadSummary.text,
          messageId: delivery.messageId,
        });
        continue;
      }
      if (payloadSummary.mediaUrls.length === 0) {
        const beforeCount = results.length;
        if (isSignalChannel) {
          await sendSignalTextChunks(payloadSummary.text);
        } else {
          await sendTextChunks(payloadSummary.text, sendOverrides);
        }
        const messageId = results.at(-1)?.messageId;
        emitMessageSent({
          success: results.length > beforeCount,
          content: payloadSummary.text,
          messageId,
        });
        continue;
      }

      if (!handler.supportsMedia) {
        log.warn(
          "Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used",
          {
            channel,
            to,
            mediaCount: payloadSummary.mediaUrls.length,
          },
        );
        const fallbackText = payloadSummary.text.trim();
        if (!fallbackText) {
          throw new Error(
            "Plugin outbound adapter does not implement sendMedia and no text fallback is available for media payload",
          );
        }
        const beforeCount = results.length;
        await sendTextChunks(fallbackText, sendOverrides);
        const messageId = results.at(-1)?.messageId;
        emitMessageSent({
          success: results.length > beforeCount,
          content: payloadSummary.text,
          messageId,
        });
        continue;
      }

      let first = true;
      let lastMessageId: string | undefined;
      for (const url of payloadSummary.mediaUrls) {
        throwIfAborted(abortSignal);
        const caption = first ? payloadSummary.text : "";
        first = false;
        if (isSignalChannel) {
          const delivery = await sendSignalMedia(caption, url);
          results.push(delivery);
          lastMessageId = delivery.messageId;
        } else {
          const delivery = await attemptPlatformSend(() =>
            handler.sendMedia(caption, url, sendOverrides),
          );
          results.push(delivery);
          lastMessageId = delivery.messageId;
        }
      }
      emitMessageSent({
        success: true,
        content: payloadSummary.text,
        messageId: lastMessageId,
      });
    } catch (err) {
      emitMessageSent({
        success: false,
        content: payloadSummary.text,
        error: describeDeliveryError(err),
      });
      if (!params.bestEffort) {
        throw err;
      }
      params.onError?.(err, payloadSummary);
    }
  }
  if (params.mirror && results.length > 0) {
    const mirrorText = resolveMirroredTranscriptText({
      text: params.mirror.text,
      mediaUrls: params.mirror.mediaUrls,
    });
    if (mirrorText) {
      await appendAssistantMessageToSessionTranscript({
        agentId: params.mirror.agentId,
        sessionKey: params.mirror.sessionKey,
        text: mirrorText,
      });
    }
  }

  return results;
}
