import { resolveGroupSessionKey } from "remoteclaw/plugin-sdk/session-store-runtime";

export function resolveWhatsAppGroupConversationId(conversationId: string): string {
  return (
    resolveGroupSessionKey({
      From: conversationId,
      ChatType: "group",
      Provider: "whatsapp",
    })?.id ?? conversationId
  );
}
