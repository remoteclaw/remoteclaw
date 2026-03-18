// Legacy compatibility shim for older channel helpers. Prefer the dedicated
// plugin-sdk subpaths instead of adding new imports here.

export * from "../channels/chat-type.js";
export * from "../channels/reply-prefix.js";
export * from "../channels/typing.js";
export type * from "../channels/plugins/types.js";
export * from "../channels/plugins/normalize/signal.js";
export * from "../channels/plugins/normalize/whatsapp.js";
export * from "../channels/plugins/outbound/interactive.js";
export * from "../channels/plugins/whatsapp-heartbeat.js";
export * from "../polls.js";
export * from "../utils/message-channel.js";
export * from "../whatsapp/normalize.js";
export { createActionGate, jsonResult, readStringParam } from "../agents/tools/common.js";
export * from "./channel-lifecycle.js";
export * from "./directory-runtime.js";
export type {
  InteractiveButtonStyle,
  InteractiveReplyButton,
  InteractiveReply,
} from "../interactive/payload.js";
export {
  isWhatsAppGroupJid,
  isWhatsAppUserTarget,
  normalizeWhatsAppTarget,
} from "../../extensions/whatsapp/src/normalize-target.js";
export {
  createAccountStatusSink,
  keepHttpServerTaskAlive,
  waitUntilAbort,
} from "./channel-lifecycle.js";
