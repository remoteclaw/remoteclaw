// Keep built-in channel IDs in a leaf module so shared config/sandbox code can
// reference them without importing channel registry helpers that may pull in
// plugin runtime state.
import { normalizeOptionalLowercaseString } from "../shared/string-coerce.js";

export const CHAT_CHANNEL_ORDER = [
  "telegram",
  "whatsapp",
  "discord",
  "irc",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "line",
] as const;

export type ChatChannelId = (typeof CHAT_CHANNEL_ORDER)[number];

export const CHANNEL_IDS = [...CHAT_CHANNEL_ORDER] as const;

const CHAT_CHANNEL_ID_SET = new Set<string>(CHAT_CHANNEL_ORDER);

// Normalize an arbitrary string to a known built-in chat channel id, or null.
// Fork-shaped: validates against the static CHAT_CHANNEL_ORDER leaf set (no
// dynamic catalog / alias map — those were gutted with the channel registry).
export function normalizeChatChannelId(raw?: string | null): ChatChannelId | null {
  const normalized = normalizeOptionalLowercaseString(raw);
  if (!normalized) {
    return null;
  }
  return CHAT_CHANNEL_ID_SET.has(normalized) ? (normalized as ChatChannelId) : null;
}
