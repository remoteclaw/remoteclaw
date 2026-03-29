// Public binding helpers for both runtime plugin-owned bindings and
// config-driven channel bindings.

// STRIPPED: export {
//   createConversationBindingRecord,
//   getConversationBindingCapabilities,
//   listSessionBindingRecords,
//   resolveConversationBindingRecord,
//   touchConversationBindingRecord,
//   unbindConversationBindingRecord,
// } from "../bindings/records.js";
// STRIPPED: export {
//   ensureConfiguredBindingRouteReady,
//   resolveConfiguredBindingRoute,
//   type ConfiguredBindingRouteResult,
// } from "../channels/plugins/binding-routing.js";
// STRIPPED: export {
//   primeConfiguredBindingRegistry,
//   resolveConfiguredBinding,
//   resolveConfiguredBindingRecord,
//   resolveConfiguredBindingRecordBySessionKey,
//   resolveConfiguredBindingRecordForConversation,
// } from "../channels/plugins/binding-registry.js";
// STRIPPED: export {
//   ensureConfiguredBindingTargetReady,
//   ensureConfiguredBindingTargetSession,
//   resetConfiguredBindingTargetInPlace,
// } from "../channels/plugins/binding-targets.js";
export { resolveConversationLabel } from "../channels/conversation-label.js";
export { recordInboundSession } from "../channels/session.js";
export { recordInboundSessionMetaSafe } from "../channels/session-meta.js";
export { resolveThreadBindingConversationIdFromBindingId } from "../channels/thread-binding-id.js";
// STRIPPED: export {
//   createScopedAccountReplyToModeResolver,
//   createStaticReplyToModeResolver,
//   createTopLevelChannelReplyToModeResolver,
// } from "../channels/plugins/threading-helpers.js";
// STRIPPED: export {
//   formatThreadBindingDurationLabel,
//   resolveThreadBindingFarewellText,
//   resolveThreadBindingIntroText,
//   resolveThreadBindingThreadName,
// } from "../channels/thread-bindings-messages.js";
export {
  DISCORD_THREAD_BINDING_CHANNEL,
// STRIPPED (not in fork):   MATRIX_THREAD_BINDING_CHANNEL,
  formatThreadBindingDisabledError,
// STRIPPED (not in fork):   resolveThreadBindingEffectiveExpiresAt,
  resolveThreadBindingIdleTimeoutMs,
  resolveThreadBindingIdleTimeoutMsForChannel,
// STRIPPED (not in fork):   resolveThreadBindingLifecycle,
  resolveThreadBindingMaxAgeMs,
  resolveThreadBindingMaxAgeMsForChannel,
  resolveThreadBindingsEnabled,
  resolveThreadBindingSpawnPolicy,
  type ThreadBindingSpawnKind,
  type ThreadBindingSpawnPolicy,
} from "../channels/thread-bindings-policy.js";
// STRIPPED: export type {
//   ConfiguredBindingConversation,
//   ConfiguredBindingResolution,
//   CompiledConfiguredBinding,
//   StatefulBindingTargetDescriptor,
// } from "../channels/plugins/binding-types.js";
// STRIPPED: export type {
//   StatefulBindingTargetDriver,
//   StatefulBindingTargetReadyResult,
//   StatefulBindingTargetResetResult,
//   StatefulBindingTargetSessionResult,
// } from "../channels/plugins/stateful-target-drivers.js";
export {
  type BindingStatus,
  type BindingTargetKind,
  type ConversationRef,
// STRIPPED (not in fork):   SessionBindingError,
  type SessionBindingAdapter,
// STRIPPED (not in fork):   type SessionBindingAdapterCapabilities,
// STRIPPED (not in fork):   type SessionBindingBindInput,
// STRIPPED (not in fork):   type SessionBindingCapabilities,
// STRIPPED (not in fork):   type SessionBindingPlacement,
  type SessionBindingRecord,
  type SessionBindingService,
// STRIPPED (not in fork):   type SessionBindingUnbindInput,
  getSessionBindingService,
// STRIPPED (not in fork):   isSessionBindingError,
  registerSessionBindingAdapter,
  unregisterSessionBindingAdapter,
} from "../infra/outbound/session-binding-service.js";
export * from "../pairing/pairing-challenge.js";
export * from "../pairing/pairing-messages.js";
export * from "../pairing/pairing-store.js";
// STRIPPED: export {
//   buildPluginBindingApprovalCustomId,
//   buildPluginBindingDeclinedText,
//   buildPluginBindingErrorText,
//   buildPluginBindingResolvedText,
//   buildPluginBindingUnavailableText,
//   detachPluginConversationBinding,
//   getCurrentPluginConversationBinding,
//   hasShownPluginBindingFallbackNotice,
//   isPluginOwnedBindingMetadata,
//   isPluginOwnedSessionBindingRecord,
//   markPluginBindingFallbackNoticeShown,
//   parsePluginBindingApprovalCustomId,
//   requestPluginConversationBinding,
//   resolvePluginConversationBindingApproval,
//   toPluginConversationBinding,
// } from "../plugins/conversation-binding.js";
