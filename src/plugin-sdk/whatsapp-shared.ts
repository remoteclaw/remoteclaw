export type { ChannelMessageActionName } from "../channels/plugins/types.js";
export type { DmPolicy, GroupPolicy, WhatsAppAccountConfig } from "../config/types.js";
export {
  createWhatsAppOutboundBase,
  resolveWhatsAppGroupIntroHint,
  resolveWhatsAppMentionStripPatterns,
} from "../channels/plugins/whatsapp-shared.js";
export { resolveWhatsAppHeartbeatRecipients } from "../channels/plugins/whatsapp-heartbeat.js";
export { isWhatsAppGroupJid, normalizeWhatsAppTarget } from "../whatsapp/normalize.js";
