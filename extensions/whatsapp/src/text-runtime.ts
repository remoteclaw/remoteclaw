export * from "remoteclaw/plugin-sdk/text-runtime";
export {
  assertWebChannel,
  isSelfChatMode,
  jidToE164,
  markdownToWhatsApp,
  resolveEquivalentWhatsAppDirectChatJids,
  resolveJidToE164,
  toWhatsappJid,
  toWhatsappJidWithLid,
  type JidToE164Options,
  type LidLookup,
  type WebChannel,
} from "./targets-runtime.js";
