import { normalizeOptionalString } from "remoteclaw/plugin-sdk/text-runtime";
import {
  DEFAULT_EMOJIS,
  type StatusReactionEmojis,
} from "../../../src/channels/status-reactions.js";

type StatusReactionEmojiKey = keyof Required<StatusReactionEmojis>;

const TELEGRAM_GENERIC_REACTION_FALLBACKS = ["👍", "👀", "🔥"] as const;

const TELEGRAM_SUPPORTED_REACTION_EMOJIS = new Set<string>([
  "❤",
  "👍",
  "👎",
  "🔥",
  "🥰",
  "👏",
  "😁",
  "🤔",
  "🤯",
  "😱",
  "🤬",
  "😢",
  "🎉",
  "🤩",
  "🤮",
  "💩",
  "🙏",
  "👌",
  "🕊",
  "🤡",
  "🥱",
  "🥴",
  "😍",
  "🐳",
  "❤‍🔥",
  "🌚",
  "🌭",
  "💯",
  "🤣",
  "⚡",
  "🍌",
  "🏆",
  "💔",
  "🤨",
  "😐",
  "🍓",
  "🍾",
  "💋",
  "🖕",
  "😈",
  "😴",
  "😭",
  "🤓",
  "👻",
  "👨‍💻",
  "👀",
  "🎃",
  "🙈",
  "😇",
  "😨",
  "🤝",
  "✍",
  "🤗",
  "🫡",
  "🎅",
  "🎄",
  "☃",
  "💅",
  "🤪",
  "🗿",
  "🆒",
  "💘",
  "🙉",
  "🦄",
  "😘",
  "💊",
  "🙊",
  "😎",
  "👾",
  "🤷‍♂",
  "🤷",
  "🤷‍♀",
  "😡",
]);

export const TELEGRAM_STATUS_REACTION_VARIANTS: Record<StatusReactionEmojiKey, string[]> = {
  queued: ["👀", "👍", "🔥"],
  thinking: ["🤔", "🤓", "👀"],
  tool: ["🔥", "⚡", "👍"],
  coding: ["👨‍💻", "🔥", "⚡"],
  web: ["⚡", "🔥", "👍"],
  done: ["👍", "🎉", "💯"],
  error: ["😱", "😨", "🤯"],
  stallSoft: ["🥱", "😴", "🤔"],
  stallHard: ["😨", "😱", "⚡"],
  compacting: ["✍", "🤔", "🤯"],
};

const STATUS_REACTION_EMOJI_KEYS: StatusReactionEmojiKey[] = [
  "queued",
  "thinking",
  "tool",
  "coding",
  "web",
  "done",
  "error",
  "stallSoft",
  "stallHard",
  "compacting",
];

function toUniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function resolveTelegramStatusReactionEmojis(params: {
  initialEmoji: string;
  overrides?: StatusReactionEmojis;
}): Required<StatusReactionEmojis> {
  const { overrides } = params;
  const queuedFallback = normalizeOptionalString(params.initialEmoji) ?? DEFAULT_EMOJIS.queued;
  return {
    queued: normalizeOptionalString(overrides?.queued) ?? queuedFallback,
    thinking: normalizeOptionalString(overrides?.thinking) ?? DEFAULT_EMOJIS.thinking,
    tool: normalizeOptionalString(overrides?.tool) ?? DEFAULT_EMOJIS.tool,
    coding: normalizeOptionalString(overrides?.coding) ?? DEFAULT_EMOJIS.coding,
    web: normalizeOptionalString(overrides?.web) ?? DEFAULT_EMOJIS.web,
    done: normalizeOptionalString(overrides?.done) ?? DEFAULT_EMOJIS.done,
    error: normalizeOptionalString(overrides?.error) ?? DEFAULT_EMOJIS.error,
    stallSoft: normalizeOptionalString(overrides?.stallSoft) ?? DEFAULT_EMOJIS.stallSoft,
    stallHard: normalizeOptionalString(overrides?.stallHard) ?? DEFAULT_EMOJIS.stallHard,
    compacting: normalizeOptionalString(overrides?.compacting) ?? DEFAULT_EMOJIS.compacting,
  };
}

export function buildTelegramStatusReactionVariants(
  emojis: Required<StatusReactionEmojis>,
): Map<string, string[]> {
  const variantsByRequested = new Map<string, string[]>();
  for (const key of STATUS_REACTION_EMOJI_KEYS) {
    const requested = normalizeOptionalString(emojis[key]);
    if (!requested) {
      continue;
    }
    const fallbackVariants = TELEGRAM_STATUS_REACTION_VARIANTS[key] ?? [];
    const candidates = toUniqueNonEmpty([requested, ...fallbackVariants]);
    variantsByRequested.set(requested, candidates);
  }
  return variantsByRequested;
}

export function isTelegramSupportedReactionEmoji(emoji: string): boolean {
  return TELEGRAM_SUPPORTED_REACTION_EMOJIS.has(emoji);
}

export function extractTelegramAllowedEmojiReactions(
  chat: unknown,
): Set<string> | null | undefined {
  if (!chat || typeof chat !== "object") {
    return undefined;
  }

  if (!Object.prototype.hasOwnProperty.call(chat, "available_reactions")) {
    return undefined;
  }

  const availableReactions = (chat as { available_reactions?: unknown }).available_reactions;
  if (availableReactions == null) {
    // Explicitly omitted/null => all emoji reactions are allowed in this chat.
    return null;
  }
  if (!Array.isArray(availableReactions)) {
    return new Set<string>();
  }

  const allowed = new Set<string>();
  for (const reaction of availableReactions) {
    if (!reaction || typeof reaction !== "object") {
      continue;
    }
    const typedReaction = reaction as { type?: unknown; emoji?: unknown };
    if (typedReaction.type !== "emoji" || typeof typedReaction.emoji !== "string") {
      continue;
    }
    const emoji = typedReaction.emoji.trim();
    if (emoji) {
      allowed.add(emoji);
    }
  }
  return allowed;
}

export async function resolveTelegramAllowedEmojiReactions(params: {
  chat: unknown;
  chatId: string | number;
  getChat?: (chatId: string | number) => Promise<unknown>;
}): Promise<Set<string> | null> {
  const fromMessage = extractTelegramAllowedEmojiReactions(params.chat);
  if (fromMessage !== undefined) {
    return fromMessage;
  }

  if (params.getChat) {
    try {
      const chatInfo = await params.getChat(params.chatId);
      const fromLookup = extractTelegramAllowedEmojiReactions(chatInfo);
      if (fromLookup !== undefined) {
        return fromLookup;
      }
    } catch {
      return null;
    }
  }

  // If unavailable, assume no explicit restriction.
  return null;
}

export function resolveTelegramReactionVariant(params: {
  requestedEmoji: string;
  variantsByRequestedEmoji: Map<string, string[]>;
  allowedEmojiReactions?: Set<string> | null;
}): string | undefined {
  const requestedEmoji = normalizeOptionalString(params.requestedEmoji);
  if (!requestedEmoji) {
    return undefined;
  }

  const configuredVariants = params.variantsByRequestedEmoji.get(requestedEmoji) ?? [
    requestedEmoji,
  ];
  const variants = toUniqueNonEmpty([
    ...configuredVariants,
    ...TELEGRAM_GENERIC_REACTION_FALLBACKS,
  ]);

  for (const candidate of variants) {
    const isAllowedByChat =
      params.allowedEmojiReactions == null || params.allowedEmojiReactions.has(candidate);
    if (isAllowedByChat && isTelegramSupportedReactionEmoji(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
