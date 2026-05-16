import { normalizeLowercaseStringOrEmpty } from "remoteclaw/plugin-sdk/text-runtime";
import type { MsgContext } from "../../../src/auto-reply/templating.js";
import { normalizeChatType } from "../../../src/channels/chat-type.js";

export function normalizeExplicitDiscordSessionKey(
  sessionKey: string,
  ctx: Pick<MsgContext, "ChatType" | "From" | "SenderId">,
): string {
  let normalized = normalizeLowercaseStringOrEmpty(sessionKey);
  if (normalizeChatType(ctx.ChatType) !== "direct") {
    return normalized;
  }

  normalized = normalized.replace(/^(discord:)dm:/, "$1direct:");
  normalized = normalized.replace(/^(agent:[^:]+:discord:)dm:/, "$1direct:");
  const match = normalized.match(/^((?:agent:[^:]+:)?)discord:channel:([^:]+)$/);
  if (!match) {
    return normalized;
  }

  const from = normalizeLowercaseStringOrEmpty(ctx.From);
  const senderId = normalizeLowercaseStringOrEmpty(ctx.SenderId);
  const fromDiscordId =
    from.startsWith("discord:") && !from.includes(":channel:") && !from.includes(":group:")
      ? from.slice("discord:".length)
      : "";
  const directId = senderId || fromDiscordId;
  return directId && directId === match[2] ? `${match[1]}discord:direct:${match[2]}` : normalized;
}
