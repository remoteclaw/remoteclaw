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
  ToolAuthorizationError,
  WhatsAppConfigSchema,
  type ChannelPlugin,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/whatsapp-core";

export {
  createWhatsAppOutboundBase,
  looksLikeWhatsAppTargetId,
  normalizeWhatsAppAllowFromEntries,
  normalizeWhatsAppMessagingTarget,
  resolveWhatsAppHeartbeatRecipients,
  resolveWhatsAppMentionStripRegexes,
  type ChannelMessageActionName,
  type DmPolicy,
  type GroupPolicy,
  type WhatsAppAccountConfig,
} from "remoteclaw/plugin-sdk/whatsapp-shared";

export { monitorWebChannel } from "./channel.runtime.js";
