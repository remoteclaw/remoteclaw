import type { AnyMessageContent } from "@whiskeysockets/baileys";
import type { NormalizedLocation } from "../../../../src/channels/location.js";

export type WebListenerCloseReason = {
  status?: number;
  isLoggedOut: boolean;
  error?: unknown;
};

export type WhatsAppStructuredContactContext = {
  kind: "contact" | "contacts";
  total: number;
  contacts: Array<{
    name?: string;
    phones?: string[];
  }>;
};

export type WebInboundMessage = {
  id?: string;
  from: string; // conversation id: E.164 for direct chats, group JID for groups
  conversationId: string; // alias for clarity (same as from)
  to: string;
  accountId: string;
  /** Set by the real inbound monitor after access-control / pairing checks pass. */
  accessControlPassed?: boolean;
  body: string;
  pushName?: string;
  timestamp?: number;
  chatType: "direct" | "group";
  chatId: string;
  senderJid?: string;
  senderE164?: string;
  senderName?: string;
  replyToId?: string;
  replyToBody?: string;
  replyToSender?: string;
  replyToSenderJid?: string;
  replyToSenderE164?: string;
  groupSubject?: string;
  groupParticipants?: string[];
  mentionedJids?: string[];
  selfJid?: string | null;
  selfE164?: string | null;
  fromMe?: boolean;
  location?: NormalizedLocation;
  sendComposing: () => Promise<void>;
  reply: (text: string) => Promise<void>;
  sendMedia: (payload: AnyMessageContent) => Promise<void>;
  mediaPath?: string;
  mediaType?: string;
  mediaFileName?: string;
  mediaUrl?: string;
  untrustedStructuredContext?: Array<{
    label: string;
    source?: string;
    type?: string;
    payload: unknown;
  }>;
  wasMentioned?: boolean;
};
