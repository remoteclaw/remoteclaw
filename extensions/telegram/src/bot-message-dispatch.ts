import type { Bot } from "grammy";
import { resolveAgentDir } from "../../../src/agents/agent-scope.js";
import { resolveChunkMode } from "../../../src/auto-reply/chunk.js";
import { clearHistoryEntriesIfEnabled } from "../../../src/auto-reply/reply/history.js";
import { dispatchReplyWithBufferedBlockDispatcher } from "../../../src/auto-reply/reply/provider-dispatcher.js";
import type { ReplyPayload } from "../../../src/auto-reply/types.js";
import { removeAckReactionAfterReply } from "../../../src/channels/ack-reactions.js";
import { logAckFailure, logTypingFailure } from "../../../src/channels/logging.js";
import { createReplyPrefixOptions } from "../../../src/channels/reply-prefix.js";
import { createTypingCallbacks } from "../../../src/channels/typing.js";
import { resolveMarkdownTableMode } from "../../../src/config/markdown-tables.js";
import {
  DEFAULT_TIMING,
  logAckFailure,
  logTypingFailure,
  removeAckReactionAfterReply,
} from "remoteclaw/plugin-sdk/channel-feedback";
import { createChannelReplyPipeline } from "remoteclaw/plugin-sdk/channel-reply-pipeline";
import { resolveChannelStreamingBlockEnabled } from "remoteclaw/plugin-sdk/channel-streaming";
import type {
  RemoteClawConfig,
  ReplyToMode,
  TelegramAccountConfig,
} from "remoteclaw/plugin-sdk/config-runtime";
import { formatErrorMessage } from "remoteclaw/plugin-sdk/error-runtime";
import {
  createOutboundPayloadPlan,
  projectOutboundPayloadPlanForDelivery,
} from "remoteclaw/plugin-sdk/outbound-runtime";
import { clearHistoryEntriesIfEnabled } from "remoteclaw/plugin-sdk/reply-history";
import { resolveSendableOutboundReplyParts } from "remoteclaw/plugin-sdk/reply-payload";
import { isAbortRequestText, type ReplyPayload } from "remoteclaw/plugin-sdk/reply-runtime";
import type { RuntimeEnv } from "remoteclaw/plugin-sdk/runtime-env";
import {
  createSubsystemLogger,
  danger,
  logVerbose,
  sleepWithAbort,
} from "remoteclaw/plugin-sdk/runtime-env";
import { defaultTelegramBotDeps, type TelegramBotDeps } from "./bot-deps.js";
import type { TelegramMessageContext } from "./bot-message-context.js";
import type { TelegramBotOptions } from "./bot.js";
import { deliverReplies } from "./bot/delivery.js";
import type { TelegramStreamMode } from "./bot/types.js";
import type { TelegramInlineButtons } from "./button-types.js";
import { createTelegramDraftStream } from "./draft-stream.js";
import { renderTelegramHtmlText } from "./format.js";
import {
  type ArchivedPreview,
  createLaneDeliveryStateTracker,
  createLaneTextDeliverer,
  type DraftLaneState,
  type LaneName,
} from "./lane-delivery.js";
import {
  createTelegramReasoningStepState,
  splitTelegramReasoningText,
} from "./reasoning-lane-coordinator.js";
import { editMessageTelegram } from "./send.js";
import { cacheSticker, describeStickerImage } from "./sticker-cache.js";

const EMPTY_RESPONSE_FALLBACK = "No response generated. Please try again.";
const silentReplyDispatchLogger = createSubsystemLogger("telegram/silent-reply-dispatch");

/** Minimum chars before sending first streaming message (improves push notification UX) */
const DRAFT_MIN_INITIAL_CHARS = 30;

export function pruneStickerMediaFromContext(
  ctxPayload: {
    MediaPath?: string;
    MediaUrl?: string;
    MediaType?: string;
    MediaPaths?: string[];
    MediaUrls?: string[];
    MediaTypes?: string[];
  },
  opts?: { stickerMediaIncluded?: boolean },
) {
  if (opts?.stickerMediaIncluded === false) {
    return;
  }
  const nextMediaPaths = Array.isArray(ctxPayload.MediaPaths)
    ? ctxPayload.MediaPaths.slice(1)
    : undefined;
  const nextMediaUrls = Array.isArray(ctxPayload.MediaUrls)
    ? ctxPayload.MediaUrls.slice(1)
    : undefined;
  const nextMediaTypes = Array.isArray(ctxPayload.MediaTypes)
    ? ctxPayload.MediaTypes.slice(1)
    : undefined;
  ctxPayload.MediaPaths = nextMediaPaths && nextMediaPaths.length > 0 ? nextMediaPaths : undefined;
  ctxPayload.MediaUrls = nextMediaUrls && nextMediaUrls.length > 0 ? nextMediaUrls : undefined;
  ctxPayload.MediaTypes = nextMediaTypes && nextMediaTypes.length > 0 ? nextMediaTypes : undefined;
  ctxPayload.MediaPath = ctxPayload.MediaPaths?.[0];
  ctxPayload.MediaUrl = ctxPayload.MediaUrls?.[0] ?? ctxPayload.MediaPath;
  ctxPayload.MediaType = ctxPayload.MediaTypes?.[0];
}

type DispatchTelegramMessageParams = {
  context: TelegramMessageContext;
  bot: Bot;
  cfg: RemoteClawConfig;
  runtime: RuntimeEnv;
  replyToMode: ReplyToMode;
  streamMode: TelegramStreamMode;
  textLimit: number;
  telegramCfg: TelegramAccountConfig;
  opts: Pick<TelegramBotOptions, "token">;
};

type TelegramReasoningLevel = "off" | "on" | "stream";

type TelegramAbortFenceState = {
  generation: number;
  activeDispatches: number;
};

// Abort can arrive on Telegram's control lane ahead of older same-session reply work.
const telegramAbortFenceByKey = new Map<string, TelegramAbortFenceState>();

function normalizeTelegramFenceKey(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveTelegramAbortFenceKey(params: {
  ctxPayload: { SessionKey?: string; CommandTargetSessionKey?: string };
  chatId: number | string;
  threadSpec: { id?: number | string | null; scope?: string };
}): string {
  return (
    normalizeTelegramFenceKey(params.ctxPayload.CommandTargetSessionKey) ??
    normalizeTelegramFenceKey(params.ctxPayload.SessionKey) ??
    `telegram:${String(params.chatId)}:${params.threadSpec.scope ?? "default"}:${params.threadSpec.id ?? "root"}`
  );
}

function beginTelegramAbortFence(params: { key: string; supersede: boolean }): number {
  const existing = telegramAbortFenceByKey.get(params.key);
  const state: TelegramAbortFenceState = existing ?? {
    generation: 0,
    activeDispatches: 0,
  };
  if (params.supersede) {
    state.generation += 1;
  }
  state.activeDispatches += 1;
  telegramAbortFenceByKey.set(params.key, state);
  return state.generation;
}

function isTelegramAbortFenceSuperseded(params: { key: string; generation: number }): boolean {
  return (telegramAbortFenceByKey.get(params.key)?.generation ?? 0) !== params.generation;
}

function endTelegramAbortFence(key: string): void {
  const state = telegramAbortFenceByKey.get(key);
  if (!state) {
    return;
  }
  state.activeDispatches -= 1;
  if (state.activeDispatches <= 0) {
    telegramAbortFenceByKey.delete(key);
  }
}

export function getTelegramAbortFenceSizeForTests(): number {
  return telegramAbortFenceByKey.size;
}

export function resetTelegramAbortFenceForTests(): void {
  telegramAbortFenceByKey.clear();
}

function resolveTelegramReasoningLevel(params: {
  cfg: RemoteClawConfig;
  sessionKey?: string;
  agentId: string;
}): TelegramReasoningLevel {
  const { cfg, sessionKey, agentId } = params;
  if (!sessionKey) {
    return "off";
  }
  try {
    const storePath = resolveStorePath(cfg.session?.store, { agentId });
    const store = loadSessionStore(storePath, { skipCache: true });
    const entry = resolveSessionStoreEntry({ store, sessionKey }).existing;
    const level = entry?.reasoningLevel;
    if (level === "on" || level === "stream") {
      return level;
    }
  } catch {
    // Fall through to default.
  }
  return "off";
}

export const dispatchTelegramMessage = async ({
  context,
  bot,
  cfg,
  runtime,
  replyToMode,
  streamMode,
  textLimit,
  telegramCfg,
  opts,
}: DispatchTelegramMessageParams) => {
  const {
    ctxPayload,
    msg,
    chatId,
    isGroup,
    threadSpec,
    historyKey,
    historyLimit,
    groupHistories,
    route,
    skillFilter,
    sendTyping,
    sendRecordVoice,
    ackReactionPromise,
    reactionApi,
    removeAckAfterReply,
    statusReactionController,
  } = context;
  const statusReactionTiming = {
    ...DEFAULT_TIMING,
    ...cfg.messages?.statusReactions?.timing,
  };
  const clearTelegramStatusReaction = async () => {
    if (!msg.message_id || !reactionApi) {
      return;
    }
    await reactionApi(chatId, msg.message_id, []);
  };
  const finalizeTelegramStatusReaction = async (params: {
    outcome: "done" | "error";
    hasFinalResponse: boolean;
  }) => {
    if (!statusReactionController) {
      return;
    }
    if (params.outcome === "done") {
      await statusReactionController.setDone();
      if (removeAckAfterReply) {
        await sleepWithAbort(statusReactionTiming.doneHoldMs);
        await clearTelegramStatusReaction();
      } else {
        await statusReactionController.restoreInitial();
      }
      return;
    }
    await statusReactionController.setError();
    if (params.hasFinalResponse) {
      if (removeAckAfterReply) {
        await sleepWithAbort(statusReactionTiming.errorHoldMs);
        await clearTelegramStatusReaction();
      } else {
        await statusReactionController.restoreInitial();
      }
      return;
    }
    if (removeAckAfterReply) {
      await sleepWithAbort(statusReactionTiming.errorHoldMs);
    }
    await statusReactionController.restoreInitial();
  };
  const dispatchFenceKey = resolveTelegramAbortFenceKey({
    ctxPayload,
    chatId,
    threadSpec,
  });
  let abortFenceGeneration: number | undefined;
  let dispatchWasSuperseded = false;
  const isDispatchSuperseded = () =>
    abortFenceGeneration !== undefined &&
    isTelegramAbortFenceSuperseded({
      key: dispatchFenceKey,
      generation: abortFenceGeneration,
    });
  const releaseAbortFence = () => {
    if (abortFenceGeneration === undefined) {
      return;
    }
    endTelegramAbortFence(dispatchFenceKey);
    abortFenceGeneration = undefined;
  };
  const draftMaxChars = Math.min(textLimit, 4096);
  const tableMode = resolveMarkdownTableMode({
    cfg,
    channel: "telegram",
    accountId: route.accountId,
  });
  const renderDraftPreview = (text: string) => ({
    text: renderTelegramHtmlText(text, { tableMode }),
    parseMode: "HTML" as const,
  });
  const accountBlockStreamingEnabled =
    typeof telegramCfg.blockStreaming === "boolean"
      ? telegramCfg.blockStreaming
      : cfg.agents?.defaults?.blockStreamingDefault === "on";
  const resolvedReasoningLevel = resolveTelegramReasoningLevel({
    cfg,
    sessionKey: ctxPayload.SessionKey,
    agentId: route.agentId,
  });
  const forceBlockStreamingForReasoning = resolvedReasoningLevel === "on";
  const streamReasoningDraft = resolvedReasoningLevel === "stream";
  const previewStreamingEnabled = streamMode !== "off";
  const canStreamAnswerDraft =
    previewStreamingEnabled && !accountBlockStreamingEnabled && !forceBlockStreamingForReasoning;
  const canStreamReasoningDraft = canStreamAnswerDraft || streamReasoningDraft;
  const draftReplyToMessageId =
    replyToMode !== "off" && typeof msg.message_id === "number" ? msg.message_id : undefined;
  const draftMinInitialChars = DRAFT_MIN_INITIAL_CHARS;
  // DM draft previews still duplicate briefly at materialize time.
  const useMessagePreviewTransportForDm = threadSpec?.scope === "dm" && canStreamAnswerDraft;
  const mediaLocalRoots = getAgentScopedMediaLocalRoots(cfg, route.agentId);
  const archivedAnswerPreviews: ArchivedPreview[] = [];
  const archivedReasoningPreviewIds: number[] = [];
  const createDraftLane = (laneName: LaneName, enabled: boolean): DraftLaneState => {
    const stream = enabled
      ? createTelegramDraftStream({
          api: bot.api,
          chatId,
          maxChars: draftMaxChars,
          thread: threadSpec,
          previewTransport: useMessagePreviewTransportForDm ? "message" : "auto",
          replyToMessageId: draftReplyToMessageId,
          minInitialChars: draftMinInitialChars,
          renderText: renderDraftPreview,
          onSupersededPreview:
            laneName === "answer" || laneName === "reasoning"
              ? (preview) => {
                  if (laneName === "reasoning") {
                    if (!archivedReasoningPreviewIds.includes(preview.messageId)) {
                      archivedReasoningPreviewIds.push(preview.messageId);
                    }
                    return;
                  }
                  archivedAnswerPreviews.push({
                    messageId: preview.messageId,
                    textSnapshot: preview.textSnapshot,
                    deleteIfUnused: true,
                  });
                }
              : undefined,
          log: logVerbose,
          warn: logVerbose,
        })
      : undefined;
    return {
      stream,
      lastPartialText: "",
      hasStreamedMessage: false,
    };
  };
  const lanes: Record<LaneName, DraftLaneState> = {
    answer: createDraftLane("answer", canStreamAnswerDraft),
    reasoning: createDraftLane("reasoning", canStreamReasoningDraft),
  };
  const activePreviewLifecycleByLane: Record<LaneName, LanePreviewLifecycle> = {
    answer: "transient",
    reasoning: "transient",
  };
  const retainPreviewOnCleanupByLane: Record<LaneName, boolean> = {
    answer: false,
    reasoning: false,
  };
  const answerLane = lanes.answer;
  const reasoningLane = lanes.reasoning;
  let splitReasoningOnNextStream = false;
  let skipNextAnswerMessageStartRotation = false;
  let pendingCompactionReplayBoundary = false;
  let draftLaneEventQueue = Promise.resolve();
  const reasoningStepState = createTelegramReasoningStepState();
  const enqueueDraftLaneEvent = (task: () => Promise<void>): Promise<void> => {
    const next = draftLaneEventQueue.then(async () => {
      if (isDispatchSuperseded()) {
        return;
      }
      await task();
    });
    draftLaneEventQueue = next.catch((err) => {
      logVerbose(`telegram: draft lane callback failed: ${String(err)}`);
    });
    return draftLaneEventQueue;
  };
  type SplitLaneSegment = { lane: LaneName; text: string };
  type SplitLaneSegmentsResult = {
    segments: SplitLaneSegment[];
    suppressedReasoningOnly: boolean;
  };
  const splitTextIntoLaneSegments = (text?: string): SplitLaneSegmentsResult => {
    const split = splitTelegramReasoningText(text);
    const segments: SplitLaneSegment[] = [];
    const suppressReasoning = resolvedReasoningLevel === "off";
    if (split.reasoningText && !suppressReasoning) {
      segments.push({ lane: "reasoning", text: split.reasoningText });
    }
    if (split.answerText) {
      segments.push({ lane: "answer", text: split.answerText });
    }
    return {
      segments,
      suppressedReasoningOnly:
        Boolean(split.reasoningText) && suppressReasoning && !split.answerText,
    };
  };
  const resetDraftLaneState = (lane: DraftLaneState) => {
    lane.lastPartialText = "";
    lane.hasStreamedMessage = false;
  };
  const rotateAnswerLaneForNewAssistantMessage = async () => {
    let didForceNewMessage = false;
    if (answerLane.hasStreamedMessage) {
      const materializedId = await answerLane.stream?.materialize?.();
      const previewMessageId = materializedId ?? answerLane.stream?.messageId();
      if (typeof previewMessageId === "number" && !finalizedPreviewByLane.answer) {
        archivedAnswerPreviews.push({
          messageId: previewMessageId,
          textSnapshot: answerLane.lastPartialText,
          deleteIfUnused: false,
        });
      }
      answerLane.stream?.forceNewMessage();
      didForceNewMessage = true;
    }
    resetDraftLaneState(answerLane);
    if (didForceNewMessage) {
      activePreviewLifecycleByLane.answer = "transient";
      retainPreviewOnCleanupByLane.answer = false;
    }
    return didForceNewMessage;
  };
  const updateDraftFromPartial = (lane: DraftLaneState, text: string | undefined) => {
    const laneStream = lane.stream;
    if (!laneStream || !text) {
      return;
    }
    if (text === lane.lastPartialText) {
      return;
    }
    lane.hasStreamedMessage = true;
    if (
      lane.lastPartialText &&
      lane.lastPartialText.startsWith(text) &&
      text.length < lane.lastPartialText.length
    ) {
      return;
    }
    lane.lastPartialText = text;
    laneStream.update(text);
  };
  const ingestDraftLaneSegments = async (text: string | undefined) => {
    const split = splitTextIntoLaneSegments(text);
    const hasAnswerSegment = split.segments.some((segment) => segment.lane === "answer");
    if (hasAnswerSegment && activePreviewLifecycleByLane.answer !== "transient") {
      skipNextAnswerMessageStartRotation = await rotateAnswerLaneForNewAssistantMessage();
    }
    for (const segment of split.segments) {
      if (segment.lane === "reasoning") {
        reasoningStepState.noteReasoningHint();
        reasoningStepState.noteReasoningDelivered();
      }
      updateDraftFromPartial(lanes[segment.lane], segment.text);
    }
  };
  const flushDraftLane = async (lane: DraftLaneState) => {
    if (!lane.stream) {
      return;
    }
    await lane.stream.flush();
  };

  const disableBlockStreaming = !previewStreamingEnabled
    ? true
    : forceBlockStreamingForReasoning
      ? false
      : typeof telegramCfg.blockStreaming === "boolean"
        ? !telegramCfg.blockStreaming
        : canStreamAnswerDraft
          ? true
          : undefined;

  const prefixOptions = createReplyPrefixOptions({
    cfg,
    agentId: route.agentId,
    channel: "telegram",
    accountId: route.accountId,
  });
  const chunkMode = resolveChunkMode(cfg, "telegram", route.accountId);
  const shouldSupersedeAbortFence =
    ctxPayload.CommandAuthorized &&
    isAbortRequestText(ctxPayload.CommandBody ?? ctxPayload.RawBody ?? ctxPayload.Body ?? "");

  abortFenceGeneration = beginTelegramAbortFence({
    key: dispatchFenceKey,
    supersede: shouldSupersedeAbortFence,
  });

  const replyQuoteText =
    ctxPayload.ReplyToIsQuote && ctxPayload.ReplyToBody
      ? ctxPayload.ReplyToBody.trim() || undefined
      : undefined;
  const deliveryState = createLaneDeliveryStateTracker();
  const clearGroupHistory = () => {
    if (isGroup && historyKey) {
      clearHistoryEntriesIfEnabled({
        historyMap: groupHistories,
        historyKey,
        limit: historyLimit,
      });
    }
  };
  const deliveryBaseOptions = {
    chatId: String(chatId),
    accountId: route.accountId,
    token: opts.token,
    runtime,
    bot,
    mediaLocalRoots,
    replyToMode,
    textLimit,
    thread: threadSpec,
    tableMode,
    chunkMode,
    linkPreview: telegramCfg.linkPreview,
    replyQuoteText,
  };
  const silentErrorReplies = telegramCfg.silentErrorReplies === true;
  const isDmTopic = !isGroup && threadSpec.scope === "dm" && threadSpec.id != null;
  let queuedFinal = false;

    if (statusReactionController) {
      void statusReactionController.setThinking();
    }

    const { onModelSelected, ...replyPipeline } = (
      telegramDeps.createChannelReplyPipeline ?? createChannelReplyPipeline
    )({
      cfg,
      agentId: route.agentId,
      channel: "telegram",
      accountId: route.accountId,
      typing: {
        start: sendTyping,
        onStartError: (err) => {
          logTypingFailure({
            log: logVerbose,
            channel: "telegram",
            target: String(chatId),
            error: err,
          });
        },
      },
    });

    try {
      ({ queuedFinal } = await telegramDeps.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          ...replyPipeline,
          deliver: async (payload, info) => {
            if (isDispatchSuperseded()) {
              return;
            }
            const clearPendingCompactionReplayBoundaryOnVisibleBoundary = (didDeliver: boolean) => {
              if (didDeliver && info.kind !== "final") {
                pendingCompactionReplayBoundary = false;
              }
            };
            if (payload.isError === true) {
              hadErrorReplyFailureOrSkip = true;
            }
            if (info.kind === "final") {
              await enqueueDraftLaneEvent(async () => {});
            }
            if (
              shouldSuppressLocalTelegramExecApprovalPrompt({
                cfg,
                accountId: route.accountId,
                payload,
              })
            ) {
              queuedFinal = true;
              return;
            }
            const previewButtons = (
              payload.channelData?.telegram as { buttons?: TelegramInlineButtons } | undefined
            )?.buttons;
            const split = splitTextIntoLaneSegments(payload.text);
            const segments = split.segments;
            const reply = resolveSendableOutboundReplyParts(payload);
            const _hasMedia = reply.hasMedia;

            const flushBufferedFinalAnswer = async () => {
              const buffered = reasoningStepState.takeBufferedFinalAnswer();
              if (!buffered) {
                return;
              }
              const bufferedButtons = (
                buffered.payload.channelData?.telegram as
                  | { buttons?: TelegramInlineButtons }
                  | undefined
              )?.buttons;
              await deliverLaneText({
                laneName: "answer",
                text: buffered.text,
                payload: buffered.payload,
                infoKind: "final",
                previewButtons: bufferedButtons,
              });
              reasoningStepState.resetForNextStep();
            };

            for (const segment of segments) {
              if (
                segment.lane === "answer" &&
                info.kind === "final" &&
                reasoningStepState.shouldBufferFinalAnswer()
              ) {
                reasoningStepState.bufferFinalAnswer({
                  payload,
                  text: segment.text,
                });
                continue;
              }
              if (segment.lane === "reasoning") {
                reasoningStepState.noteReasoningHint();
              }
              const result = await deliverLaneText({
                laneName: segment.lane,
                text: segment.text,
                payload,
                infoKind: info.kind,
                previewButtons,
                allowPreviewUpdateForNonFinal: segment.lane === "reasoning",
              });
              if (info.kind === "final") {
                emitPreviewFinalizedHook(result);
              }
              if (segment.lane === "reasoning") {
                if (result.kind !== "skipped") {
                  reasoningStepState.noteReasoningDelivered();
                  await flushBufferedFinalAnswer();
                }
                continue;
              }
              if (info.kind === "final") {
                if (reasoningLane.hasStreamedMessage) {
                  activePreviewLifecycleByLane.reasoning = "complete";
                  retainPreviewOnCleanupByLane.reasoning = true;
                }
                reasoningStepState.resetForNextStep();
              }
            }
            if (segments.length > 0) {
              if (info.kind === "final") {
                pendingCompactionReplayBoundary = false;
              }
              return;
            }
            if (split.suppressedReasoningOnly) {
              if (reply.hasMedia) {
                const payloadWithoutSuppressedReasoning =
                  typeof payload.text === "string" ? { ...payload, text: "" } : payload;
                clearPendingCompactionReplayBoundaryOnVisibleBoundary(
                  await sendPayload(payloadWithoutSuppressedReasoning),
                );
              }
              if (info.kind === "final") {
                await flushBufferedFinalAnswer();
                pendingCompactionReplayBoundary = false;
              }
              return;
            }

            if (info.kind === "final") {
              await answerLane.stream?.stop();
              await reasoningLane.stream?.stop();
              reasoningStepState.resetForNextStep();
            }
            const canSendAsIs = reply.hasMedia || reply.text.length > 0;
            if (!canSendAsIs) {
              if (info.kind === "final") {
                await flushBufferedFinalAnswer();
                pendingCompactionReplayBoundary = false;
              }
              return;
            }
            clearPendingCompactionReplayBoundaryOnVisibleBoundary(await sendPayload(payload));
            if (info.kind === "final") {
              await flushBufferedFinalAnswer();
              pendingCompactionReplayBoundary = false;
            }
          },
          onSkip: (payload, info) => {
            if (payload.isError === true) {
              hadErrorReplyFailureOrSkip = true;
            }
            if (info.reason !== "silent") {
              deliveryState.markNonSilentSkip();
            }
          },
          onError: (err, info) => {
            const errorPolicy = resolveTelegramErrorPolicy({
              accountConfig: telegramCfg,
              groupConfig,
              topicConfig,
            });
            if (isSilentErrorPolicy(errorPolicy.policy)) {
              return;
            }
            if (
              errorPolicy.policy === "once" &&
              shouldSuppressTelegramError({
                scopeKey: buildTelegramErrorScopeKey({
                  accountId: route.accountId,
                  chatId,
                  threadId: threadSpec.id,
                }),
                cooldownMs: errorPolicy.cooldownMs,
                errorMessage: String(err),
              })
            ) {
              return;
            }
            deliveryState.markNonSilentFailure();
            runtime.error?.(danger(`telegram ${info.kind} reply failed: ${String(err)}`));
          },
        },
        replyOptions: {
          skillFilter,
          disableBlockStreaming,
          onPartialReply:
            answerLane.stream || reasoningLane.stream
              ? (payload) =>
                  enqueueDraftLaneEvent(async () => {
                    await ingestDraftLaneSegments(payload.text);
                  })
              : undefined,
          onReasoningStream: reasoningLane.stream
            ? (payload) =>
                enqueueDraftLaneEvent(async () => {
                  if (splitReasoningOnNextStream) {
                    reasoningLane.stream?.forceNewMessage();
                    resetDraftLaneState(reasoningLane);
                    splitReasoningOnNextStream = false;
                  }
                  await ingestDraftLaneSegments(payload.text);
                })
            : undefined,
          onAssistantMessageStart: answerLane.stream
            ? () =>
                enqueueDraftLaneEvent(async () => {
                  reasoningStepState.resetForNextStep();
                  if (skipNextAnswerMessageStartRotation) {
                    skipNextAnswerMessageStartRotation = false;
                    activePreviewLifecycleByLane.answer = "transient";
                    retainPreviewOnCleanupByLane.answer = false;
                    return;
                  }
                  if (pendingCompactionReplayBoundary) {
                    pendingCompactionReplayBoundary = false;
                    activePreviewLifecycleByLane.answer = "transient";
                    retainPreviewOnCleanupByLane.answer = false;
                    return;
                  }
                  await rotateAnswerLaneForNewAssistantMessage();
                  activePreviewLifecycleByLane.answer = "transient";
                  retainPreviewOnCleanupByLane.answer = false;
                })
            : undefined,
          onReasoningEnd: reasoningLane.stream
            ? () =>
                enqueueDraftLaneEvent(async () => {
                  splitReasoningOnNextStream = reasoningLane.hasStreamedMessage;
                })
            : undefined,
          onToolStart: statusReactionController
            ? async (payload) => {
                const toolName = payload.name?.trim();
                if (toolName) {
                  await statusReactionController.setTool(toolName);
                }
              }
            : undefined,
          onCompactionStart:
            statusReactionController || answerLane.stream
              ? async () => {
                  if (
                    answerLane.hasStreamedMessage &&
                    activePreviewLifecycleByLane.answer === "transient"
                  ) {
                    pendingCompactionReplayBoundary = true;
                  }
                  if (statusReactionController) {
                    await statusReactionController.setCompacting();
                  }
                }
              : undefined,
          onCompactionEnd: statusReactionController
            ? async () => {
                statusReactionController.cancelPending();
                await statusReactionController.setThinking();
              }
            : undefined,
          onModelSelected,
        },
      }));
    } catch (err) {
      dispatchError = err;
      runtime.error?.(danger(`telegram dispatch failed: ${String(err)}`));
    } finally {
      await draftLaneEventQueue;
      if (isDispatchSuperseded()) {
        if (answerLane.hasStreamedMessage || typeof answerLane.stream?.messageId() === "number") {
          retainPreviewOnCleanupByLane.answer = true;
        }
        for (const archivedPreview of archivedAnswerPreviews) {
          archivedPreview.deleteIfUnused = false;
        }
      }
      const streamCleanupStates = new Map<
        NonNullable<DraftLaneState["stream"]>,
        { shouldClear: boolean }
      >();
      const lanesToCleanup: Array<{ laneName: LaneName; lane: DraftLaneState }> = [
        { laneName: "answer", lane: answerLane },
        { laneName: "reasoning", lane: reasoningLane },
      ];
      for (const laneState of lanesToCleanup) {
        const stream = laneState.lane.stream;
        if (!stream) {
          continue;
        }
        const activePreviewMessageId = stream.messageId();
        const hasBoundaryFinalizedActivePreview =
          laneState.laneName === "answer" &&
          typeof activePreviewMessageId === "number" &&
          archivedAnswerPreviews.some(
            (p) => p.deleteIfUnused === false && p.messageId === activePreviewMessageId,
          );
        const shouldClear =
          !retainPreviewOnCleanupByLane[laneState.laneName] && !hasBoundaryFinalizedActivePreview;
        const existing = streamCleanupStates.get(stream);
        if (!existing) {
          streamCleanupStates.set(stream, { shouldClear });
          continue;
        }
        existing.shouldClear = existing.shouldClear && shouldClear;
      }
      for (const [stream, cleanupState] of streamCleanupStates) {
        if (isDispatchSuperseded()) {
          await (typeof stream.discard === "function" ? stream.discard() : stream.stop());
          continue;
        }
        await stream.stop();
        if (cleanupState.shouldClear) {
          await stream.clear();
        }
      }
      if (!isDispatchSuperseded()) {
        for (const archivedPreview of archivedAnswerPreviews) {
          if (archivedPreview.deleteIfUnused === false) {
            continue;
          }
          try {
            await bot.api.deleteMessage(chatId, archivedPreview.messageId);
          } catch (err) {
            logVerbose(
              `telegram: archived answer preview cleanup failed (${archivedPreview.messageId}): ${String(err)}`,
            );
          }
        }
        for (const messageId of archivedReasoningPreviewIds) {
          try {
            await bot.api.deleteMessage(chatId, messageId);
          } catch (err) {
            logVerbose(
              `telegram: archived reasoning preview cleanup failed (${messageId}): ${String(err)}`,
            );
          }
        }
      }
    }
  } finally {
    dispatchWasSuperseded = isDispatchSuperseded();
    releaseAbortFence();
  }
  if (dispatchWasSuperseded) {
    if (statusReactionController) {
      void finalizeTelegramStatusReaction({ outcome: "done", hasFinalResponse: true }).catch(
        (err: unknown) => {
          logVerbose(`telegram: status reaction finalize failed: ${String(err)}`);
        },
      );
    } else {
      removeAckReactionAfterReply({
        removeAfterReply: removeAckAfterReply,
        ackReactionPromise,
        ackReactionValue: ackReactionPromise ? "ack" : null,
        remove: () =>
          (reactionApi?.(chatId, msg.message_id ?? 0, []) ?? Promise.resolve()).then(() => {}),
        onError: (err) => {
          if (!msg.message_id) {
            return;
          }
          logAckFailure({
            log: logVerbose,
            channel: "telegram",
            target: `${chatId}/${msg.message_id}`,
            error: err,
          });
        },
      });
    }
    clearGroupHistory();
    return;
  }
  let sentFallback = false;
  const deliverySummary = deliveryState.snapshot();
  if (
    dispatchError ||
    (!deliverySummary.delivered &&
      (deliverySummary.skippedNonSilent > 0 || deliverySummary.failedNonSilent > 0))
  ) {
    const fallbackText = dispatchError
      ? "Something went wrong while processing your request. Please try again."
      : EMPTY_RESPONSE_FALLBACK;
    const result = await deliverReplies({
      replies: [{ text: fallbackText }],
      ...deliveryBaseOptions,
    });
    sentFallback = result.delivered;
  }

  if (!queuedFinal && !sentFallback && !dispatchError && !deliverySummary.delivered) {
    const policySessionKey =
      ctxPayload.CommandSource === "native"
        ? (ctxPayload.CommandTargetSessionKey ?? ctxPayload.SessionKey)
        : ctxPayload.SessionKey;
    const silentReplyFallback = projectOutboundPayloadPlanForDelivery(
      createOutboundPayloadPlan([{ text: "NO_REPLY" }], {
        cfg,
        sessionKey: policySessionKey,
        surface: "telegram",
      }),
    );
    if (silentReplyFallback.length > 0) {
      const result = await (telegramDeps.deliverReplies ?? deliverReplies)({
        replies: silentReplyFallback,
        ...deliveryBaseOptions,
        silent: false,
        mediaLoader: telegramDeps.loadWebMedia,
      });
      sentFallback = result.delivered;
    }
    silentReplyDispatchLogger.debug("telegram turn ended without visible final response", {
      hasSessionKey: Boolean(policySessionKey),
      hasChatId: chatId != null,
      queuedFinal,
      sentFallback,
    });
  }

  const hasFinalResponse = queuedFinal || sentFallback || deliverySummary.delivered;

  if (statusReactionController && !hasFinalResponse) {
    void finalizeTelegramStatusReaction({ outcome: "error", hasFinalResponse: false }).catch(
      (err: unknown) => {
        logVerbose(`telegram: status reaction error finalize failed: ${String(err)}`);
      },
    );
  }

  if (!hasFinalResponse) {
    clearGroupHistory();
    return;
  }

  if (statusReactionController) {
    const statusReactionOutcome = dispatchError || sentFallback ? "error" : "done";
    void finalizeTelegramStatusReaction({
      outcome: statusReactionOutcome,
      hasFinalResponse: true,
    }).catch((err: unknown) => {
      logVerbose(`telegram: status reaction finalize failed: ${String(err)}`);
    });
  } else {
    removeAckReactionAfterReply({
      removeAfterReply: removeAckAfterReply,
      ackReactionPromise,
      ackReactionValue: ackReactionPromise ? "ack" : null,
      remove: () => reactionApi?.(chatId, msg.message_id ?? 0, []) ?? Promise.resolve(),
      onError: (err) => {
        if (!msg.message_id) {
          return;
        }
        logAckFailure({
          log: logVerbose,
          channel: "telegram",
          target: `${chatId}/${msg.message_id}`,
          error: err,
        });
      },
    });
  }
  clearGroupHistory();
};
