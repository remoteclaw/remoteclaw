import { isMessagingToolDuplicate } from "../../agents/pi-embedded-helpers.js";
import type { MessagingToolSend } from "../../agents/pi-embedded-messaging.js";
import type { ReplyToMode } from "../../config/types.js";
import { normalizeTargetForProvider } from "../../infra/outbound/target-normalization.js";
import type { OriginatingChannelType } from "../templating.js";
import type { ReplyPayload } from "../types.js";
import { extractReplyToTag } from "./reply-tags.js";
import { createReplyToModeFilterForChannel } from "./reply-threading.js";

export function applyReplyTagsToPayload(
  payload: ReplyPayload,
  currentMessageId?: string,
): ReplyPayload {
  if (typeof payload.text !== "string") {
    if (!payload.replyToCurrent || payload.replyToId) {
      return payload;
    }
    return {
      ...payload,
      replyToId: currentMessageId?.trim() || undefined,
    };
  }
  const shouldParseTags = payload.text.includes("[[");
  if (!shouldParseTags) {
    if (!payload.replyToCurrent || payload.replyToId) {
      return payload;
    }
    return {
      ...payload,
      replyToId: currentMessageId?.trim() || undefined,
      replyToTag: payload.replyToTag ?? true,
    };
  }
  const { cleaned, replyToId, replyToCurrent, hasTag } = extractReplyToTag(
    payload.text,
    currentMessageId,
  );
  return {
    ...payload,
    text: cleaned ? cleaned : undefined,
    replyToId: replyToId ?? payload.replyToId,
    replyToTag: hasTag || payload.replyToTag,
    replyToCurrent: replyToCurrent || payload.replyToCurrent,
  };
}

export function isRenderablePayload(payload: ReplyPayload): boolean {
  return Boolean(
    payload.text ||
    payload.mediaUrl ||
    (payload.mediaUrls && payload.mediaUrls.length > 0) ||
    payload.audioAsVoice ||
    payload.channelData,
  );
}

export function applyReplyThreading(params: {
  payloads: ReplyPayload[];
  replyToMode: ReplyToMode;
  replyToChannel?: OriginatingChannelType;
  currentMessageId?: string;
}): ReplyPayload[] {
  const { payloads, replyToMode, replyToChannel, currentMessageId } = params;
  const applyReplyToMode = createReplyToModeFilterForChannel(replyToMode, replyToChannel);
  return payloads
    .map((payload) => applyReplyTagsToPayload(payload, currentMessageId))
    .filter(isRenderablePayload)
    .map(applyReplyToMode);
}

export function filterMessagingToolDuplicates(params: {
  payloads: ReplyPayload[];
  sentTexts: string[];
}): ReplyPayload[] {
  const { payloads, sentTexts } = params;
  if (sentTexts.length === 0) {
    return payloads;
  }
  return payloads.filter((payload) => !isMessagingToolDuplicate(payload.text ?? "", sentTexts));
}

export function filterMessagingToolMediaDuplicates(params: {
  payloads: ReplyPayload[];
  sentMediaUrls: string[];
}): ReplyPayload[] {
  const { payloads, sentMediaUrls } = params;
  if (sentMediaUrls.length === 0) {
    return payloads;
  }
  const sentSet = new Set(sentMediaUrls);
  return payloads.map((payload) => {
    const mediaUrl = payload.mediaUrl;
    const mediaUrls = payload.mediaUrls;
    const stripSingle = mediaUrl && sentSet.has(mediaUrl);
    const filteredUrls = mediaUrls?.filter((u) => !sentSet.has(u));
    if (!stripSingle && (!mediaUrls || filteredUrls?.length === mediaUrls.length)) {
      return payload; // No change
    }
    return {
      ...payload,
      mediaUrl: stripSingle ? undefined : mediaUrl,
      mediaUrls: filteredUrls?.length ? filteredUrls : undefined,
    };
  });
}

function normalizeAccountId(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export function shouldSuppressMessagingToolReplies(params: {
  messageProvider?: string;
  messagingToolSentTargets?: MessagingToolSend[];
  originatingTo?: string;
  accountId?: string;
}): boolean {
  const provider = params.messageProvider?.trim().toLowerCase();
  if (!provider) {
    return false;
  }
  const originTarget = normalizeTargetForProvider(provider, params.originatingTo);
  if (!originTarget) {
    return false;
  }
  const originAccount = normalizeAccountId(params.accountId);
  const sentTargets = params.messagingToolSentTargets ?? [];
  if (sentTargets.length === 0) {
    return false;
  }
  return sentTargets.some((target) => {
    if (!target?.provider) {
      return false;
    }
    if (target.provider.trim().toLowerCase() !== provider) {
      return false;
    }
    const targetKey = normalizeTargetForProvider(provider, target.to);
    if (!targetKey) {
      return false;
    }
    const targetAccount = normalizeAccountId(target.accountId);
    if (originAccount && targetAccount && originAccount !== targetAccount) {
      return false;
    }
    return targetKey === originTarget;
  });
}
