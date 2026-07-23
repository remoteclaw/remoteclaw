/**
 * Channel conversation kind normalization.
 *
 * Maps channel-specific direct/group/channel labels into RemoteClaw chat types.
 */
import { normalizeOptionalLowercaseString } from "@remoteclaw/normalization-core/string-coerce";

/**
 * Normalized conversation kind shared by channel routing, sessions, and SDK helpers.
 */
export type ChatType = "direct" | "group" | "channel";

/**
 * Normalizes channel-specific chat type labels into RemoteClaw conversation kinds.
 */
export function normalizeChatType(raw?: string): ChatType | undefined {
  const value = normalizeOptionalLowercaseString(raw);
  if (!value) {
    return undefined;
  }
  if (value === "direct" || value === "dm") {
    return "direct";
  }
  if (value === "group") {
    return "group";
  }
  if (value === "channel") {
    return "channel";
  }
  return undefined;
}
