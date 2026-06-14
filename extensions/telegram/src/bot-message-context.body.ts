import { normalizeOptionalLowercaseString } from "remoteclaw/plugin-sdk/text-runtime";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { hasControlCommand } from "../../../src/auto-reply/command-detection.js";
import {
  recordPendingHistoryEntryIfEnabled,
  type HistoryEntry,
} from "../../../src/auto-reply/reply/history.js";
import {
  buildMentionRegexes,
  matchesMentionWithExplicit,
} from "../../../src/auto-reply/reply/mentions.js";
import type { MsgContext } from "../../../src/auto-reply/templating.js";
import { resolveControlCommandGate } from "../../../src/channels/command-gating.js";
import { formatLocationText, type NormalizedLocation } from "../../../src/channels/location.js";
import { logInboundDrop } from "../../../src/channels/logging.js";
import {
  implicitMentionKindWhen,
  resolveInboundMentionDecision,
} from "../../../src/channels/mention-gating.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type {
  TelegramDirectConfig,
  TelegramGroupConfig,
  TelegramTopicConfig,
} from "../../../src/config/types.js";
import { logVerbose } from "../../../src/globals.js";
import type { NormalizedAllowFrom } from "./bot-access.js";
import { isSenderAllowed } from "./bot-access.js";
import type {
  TelegramLogger,
  TelegramMediaRef,
  TelegramMessageContextOptions,
} from "./bot-message-context.types.js";
import {
  buildSenderLabel,
  buildTelegramGroupPeerId,
  expandTextLinks,
  extractTelegramLocation,
  getTelegramTextParts,
  hasBotMention,
  resolveTelegramMediaPlaceholder,
} from "./bot/helpers.js";
import type { TelegramContext } from "./bot/types.js";
import { isTelegramForumServiceMessage } from "./forum-service-message.js";

type StickerVisionRuntime = typeof import("./sticker-vision.runtime.js");
type MediaUnderstandingRuntime = typeof import("./media-understanding.runtime.js");

let stickerVisionRuntimePromise: Promise<StickerVisionRuntime> | undefined;
let mediaUnderstandingRuntimePromise: Promise<MediaUnderstandingRuntime> | undefined;

function loadStickerVisionRuntime(): Promise<StickerVisionRuntime> {
  stickerVisionRuntimePromise ??= import("./sticker-vision.runtime.js");
  return stickerVisionRuntimePromise;
}

function loadMediaUnderstandingRuntime(): Promise<MediaUnderstandingRuntime> {
  mediaUnderstandingRuntimePromise ??= import("./media-understanding.runtime.js");
  return mediaUnderstandingRuntimePromise;
}

export type TelegramInboundBodyResult = {
  bodyText: string;
  rawBody: string;
  historyKey?: string;
  commandAuthorized: boolean;
  effectiveWasMentioned: boolean;
  canDetectMention: boolean;
  shouldBypassMention: boolean;
  stickerCacheHit: boolean;
  locationData?: NormalizedLocation;
};

export async function resolveTelegramInboundBody(params: {
  cfg: RemoteClawConfig;
  primaryCtx: TelegramContext;
  msg: TelegramContext["message"];
  allMedia: TelegramMediaRef[];
  isGroup: boolean;
  chatId: number | string;
  senderId: string;
  senderUsername: string;
  resolvedThreadId?: number;
  routeAgentId?: string;
  effectiveGroupAllow: NormalizedAllowFrom;
  effectiveDmAllow: NormalizedAllowFrom;
  groupConfig?: TelegramGroupConfig | TelegramDirectConfig;
  topicConfig?: TelegramTopicConfig;
  requireMention?: boolean;
  options?: TelegramMessageContextOptions;
  groupHistories: Map<string, HistoryEntry[]>;
  historyLimit: number;
  logger: TelegramLogger;
}): Promise<TelegramInboundBodyResult | null> {
  const {
    cfg,
    primaryCtx,
    msg,
    allMedia,
    isGroup,
    chatId,
    senderId,
    senderUsername,
    resolvedThreadId,
    routeAgentId,
    effectiveGroupAllow,
    effectiveDmAllow,
    groupConfig,
    topicConfig,
    requireMention,
    options,
    groupHistories,
    historyLimit,
    logger,
  } = params;
  const botUsername = normalizeOptionalLowercaseString(primaryCtx.me?.username);
  const mentionRegexes = buildMentionRegexes(cfg, routeAgentId);
  const messageTextParts = getTelegramTextParts(msg);
  const allowForCommands = isGroup ? effectiveGroupAllow : effectiveDmAllow;
  const senderAllowedForCommands = isSenderAllowed({
    allow: allowForCommands,
    senderId,
    senderUsername,
  });
  const useAccessGroups = cfg.commands?.useAccessGroups !== false;
  const hasControlCommandInMessage = hasControlCommand(messageTextParts.text, cfg, {
    botUsername,
  });
  const commandGate = resolveControlCommandGate({
    useAccessGroups,
    authorizers: [{ configured: allowForCommands.hasEntries, allowed: senderAllowedForCommands }],
    allowTextCommands: true,
    hasControlCommand: hasControlCommandInMessage,
  });
  const commandAuthorized = commandGate.commandAuthorized;
  const historyKey = isGroup ? buildTelegramGroupPeerId(chatId, resolvedThreadId) : undefined;

  let placeholder = resolveTelegramMediaPlaceholder(msg) ?? "";
  const cachedStickerDescription = allMedia[0]?.stickerMetadata?.cachedDescription;
  const stickerCacheHit = Boolean(cachedStickerDescription);
  if (stickerCacheHit) {
    const emoji = allMedia[0]?.stickerMetadata?.emoji;
    const setName = allMedia[0]?.stickerMetadata?.setName;
    const stickerContext = [emoji, setName ? `from "${setName}"` : null].filter(Boolean).join(" ");
    placeholder = `[Sticker${stickerContext ? ` ${stickerContext}` : ""}] ${cachedStickerDescription}`;
  }

  const locationData = extractTelegramLocation(msg);
  const locationText = locationData ? formatLocationText(locationData) : undefined;
  const rawText = expandTextLinks(messageTextParts.text, messageTextParts.entities).trim();
  const hasUserText = Boolean(rawText || locationText);
  let rawBody = [rawText, locationText].filter(Boolean).join("\n").trim();
  if (!rawBody) {
    rawBody = placeholder;
  }
  if (!rawBody && allMedia.length === 0) {
    return null;
  }

  let bodyText = rawBody;
  const hasAudio = allMedia.some((media) => media.contentType?.startsWith("audio/"));
  const disableAudioPreflight =
    (topicConfig?.disableAudioPreflight ??
      (groupConfig as TelegramGroupConfig | undefined)?.disableAudioPreflight) === true;

  let preflightTranscript: string | undefined;
  const needsPreflightTranscription =
    isGroup &&
    requireMention &&
    hasAudio &&
    !hasUserText &&
    mentionRegexes.length > 0 &&
    !disableAudioPreflight;

  if (needsPreflightTranscription) {
    try {
      const { transcribeFirstAudio } =
        await import("../../../src/media-understanding/audio-preflight.js");
      const tempCtx: MsgContext = {
        MediaPaths: allMedia.length > 0 ? allMedia.map((m) => m.path) : undefined,
        MediaTypes:
          allMedia.length > 0
            ? (allMedia.map((m) => m.contentType).filter(Boolean) as string[])
            : undefined,
      };
      preflightTranscript = (await transcribeFirstAudio({
        ctx: tempCtx,
        cfg,
        agentDir: undefined,
      })) as string | undefined;
    } catch (err) {
      logVerbose(`telegram: audio preflight transcription failed: ${String(err)}`);
    }
  }

  if (hasAudio && bodyText === "<media:audio>" && preflightTranscript) {
    bodyText = preflightTranscript;
  }

  if (!bodyText && allMedia.length > 0) {
    if (hasAudio) {
      bodyText = preflightTranscript || "<media:audio>";
    } else {
      bodyText = `<media:image>${allMedia.length > 1 ? ` (${allMedia.length} images)` : ""}`;
    }
  }

  const hasAnyMention = messageTextParts.entities.some((ent: any) => ent.type === "mention");
  const explicitlyMentioned = botUsername ? hasBotMention(msg, botUsername) : false;
  const computedWasMentioned = matchesMentionWithExplicit({
    text: messageTextParts.text,
    mentionRegexes,
    explicit: {
      hasAnyMention,
      isExplicitlyMentioned: explicitlyMentioned,
      canResolveExplicit: Boolean(botUsername),
    },
    transcript: preflightTranscript,
  });
  const wasMentioned = options?.forceWasMentioned === true ? true : computedWasMentioned;

  if (isGroup && commandGate.shouldBlock) {
    logInboundDrop({
      log: logVerbose,
      channel: "telegram",
      reason: "control command (unauthorized)",
      target: senderId ?? "unknown",
    });
    return null;
  }

  const botId = primaryCtx.me?.id;
  const replyFromId = msg.reply_to_message?.from?.id;
  const replyToBotMessage = botId != null && replyFromId === botId;
  const isReplyToServiceMessage =
    replyToBotMessage && isTelegramForumServiceMessage(msg.reply_to_message);
  const implicitMentionKinds = implicitMentionKindWhen(
    "reply_to_bot",
    replyToBotMessage && !isReplyToServiceMessage,
  );
  const canDetectMention = Boolean(botUsername) || mentionRegexes.length > 0;
  const mentionDecision = resolveInboundMentionDecision({
    facts: {
      canDetectMention,
      wasMentioned,
      hasAnyMention,
      implicitMentionKinds: isGroup && Boolean(requireMention) ? implicitMentionKinds : [],
    },
    policy: {
      isGroup,
      requireMention: Boolean(requireMention),
      allowTextCommands: true,
      hasControlCommand: hasControlCommandInMessage,
      commandAuthorized,
    },
  });
  const effectiveWasMentioned = mentionDecision.effectiveWasMentioned;
  if (isGroup && requireMention && canDetectMention && mentionDecision.shouldSkip) {
    logger.info({ chatId, reason: "no-mention" }, "skipping group message");
    recordPendingHistoryEntryIfEnabled({
      historyMap: groupHistories,
      historyKey: historyKey ?? "",
      limit: historyLimit,
      entry: historyKey
        ? {
            sender: buildSenderLabel(msg, senderId || chatId),
            body: rawBody,
            timestamp: msg.date ? msg.date * 1000 : undefined,
            messageId: typeof msg.message_id === "number" ? String(msg.message_id) : undefined,
          }
        : null,
    });
    return null;
  }

  return {
    bodyText,
    rawBody,
    historyKey,
    commandAuthorized,
    effectiveWasMentioned,
    canDetectMention,
    shouldBypassMention: mentionDecision.shouldBypassMention,
    stickerCacheHit,
    locationData: locationData ?? undefined,
  };
}
