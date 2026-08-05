export type ParsedTelegramTopicConversation = {
  chatId: string;
  topicId: string;
  canonicalConversationId: string;
};

export function normalizeConversationText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return `${value}`.trim();
  }
  return "";
}

function normalizeOptionalConversationText(value: unknown): string | undefined {
  return normalizeConversationText(value) || undefined;
}

/**
 * Resolve the conversation id a message belongs to from its delivery targets.
 *
 * Restored in the fork: the upstream home (`src/infra/outbound/conversation-id.ts`)
 * was already a `() => undefined` stub when the gut wave deleted it (#2374), and
 * its single caller in `session.ts` inherited that stub inline. With the resolver
 * inert, every ACP binding lookup fell back to "conversation unidentifiable", so
 * `/new` and `/reset` were suppressed for *every* ACP-shaped session key instead
 * of only genuinely-bound ones (#2929).
 */
export function resolveConversationIdFromTargets(params: {
  threadId?: string | number;
  targets: Array<string | undefined | null>;
}): string | undefined {
  const threadId =
    params.threadId != null ? normalizeOptionalConversationText(params.threadId) : undefined;
  if (threadId) {
    return threadId;
  }

  for (const rawTarget of params.targets) {
    const target = normalizeOptionalConversationText(rawTarget);
    if (!target) {
      continue;
    }
    if (target.startsWith("channel:")) {
      const channelId = normalizeOptionalConversationText(target.slice("channel:".length));
      if (channelId) {
        return channelId;
      }
      continue;
    }
    const mentionMatch = target.match(/^<#(\d+)>$/);
    if (mentionMatch?.[1]) {
      return mentionMatch[1];
    }
    if (/^\d{6,}$/.test(target)) {
      return target;
    }
  }

  return undefined;
}

export function parseTelegramChatIdFromTarget(raw: unknown): string | undefined {
  const text = normalizeConversationText(raw);
  if (!text) {
    return undefined;
  }
  const match = text.match(/^telegram:(-?\d+)$/);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1];
}

export function buildTelegramTopicConversationId(params: {
  chatId: string;
  topicId: string;
}): string | null {
  const chatId = params.chatId.trim();
  const topicId = params.topicId.trim();
  if (!/^-?\d+$/.test(chatId) || !/^\d+$/.test(topicId)) {
    return null;
  }
  return `${chatId}:topic:${topicId}`;
}

export function parseTelegramTopicConversation(params: {
  conversationId: string;
  parentConversationId?: string;
}): ParsedTelegramTopicConversation | null {
  const conversation = params.conversationId.trim();
  const directMatch = conversation.match(/^(-?\d+):topic:(\d+)$/i);
  if (directMatch?.[1] && directMatch[2]) {
    const canonicalConversationId = buildTelegramTopicConversationId({
      chatId: directMatch[1],
      topicId: directMatch[2],
    });
    if (!canonicalConversationId) {
      return null;
    }
    return {
      chatId: directMatch[1],
      topicId: directMatch[2],
      canonicalConversationId,
    };
  }
  if (!/^\d+$/.test(conversation)) {
    return null;
  }
  const parent = params.parentConversationId?.trim();
  if (!parent || !/^-?\d+$/.test(parent)) {
    return null;
  }
  const canonicalConversationId = buildTelegramTopicConversationId({
    chatId: parent,
    topicId: conversation,
  });
  if (!canonicalConversationId) {
    return null;
  }
  return {
    chatId: parent,
    topicId: conversation,
    canonicalConversationId,
  };
}
