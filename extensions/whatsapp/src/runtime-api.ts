export {
  buildChannelConfigSchema,
  createActionGate,
  DEFAULT_ACCOUNT_ID,
  formatWhatsAppConfigAllowFromEntries,
  getChatChannelMeta,
  jsonResult,
  normalizeE164,
  readReactionParams,
  readStringParam,
  resolveWhatsAppGroupIntroHint,
  resolveWhatsAppGroupRequireMention,
  resolveWhatsAppGroupToolPolicy,
  resolveWhatsAppOutboundTarget,
  ToolAuthorizationError,
  WhatsAppConfigSchema,
  type ChannelPlugin,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/whatsapp-core";

export {
  createWhatsAppOutboundBase,
  isWhatsAppGroupJid,
  looksLikeWhatsAppTargetId,
  normalizeWhatsAppAllowFromEntries,
  normalizeWhatsAppMessagingTarget,
  normalizeWhatsAppTarget,
  resolveWhatsAppHeartbeatRecipients,
  resolveWhatsAppMentionStripRegexes,
  type ChannelMessageActionName,
  type DmPolicy,
  type GroupPolicy,
  type WhatsAppAccountConfig,
} from "remoteclaw/plugin-sdk/whatsapp-shared";

export { monitorWebChannel } from "./channel.runtime.js";
