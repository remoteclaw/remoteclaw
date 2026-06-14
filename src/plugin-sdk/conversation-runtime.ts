// Public binding helpers for both runtime plugin-owned bindings and
// config-driven channel bindings.

// [reconcile] dropped re-export (gutted source: ../bindings/records.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/binding-routing.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/binding-registry.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/binding-targets.js)
export { resolveConversationLabel } from "../channels/conversation-label.js";
export { recordInboundSession } from "../channels/session.js";
export { recordInboundSessionMetaSafe } from "../channels/session-meta.js";
export { resolveThreadBindingConversationIdFromBindingId } from "../channels/thread-binding-id.js";
// [reconcile] dropped re-export (gutted source: ../channels/plugins/threading-helpers.js)
// [reconcile] dropped re-export (gutted source: ../channels/thread-bindings-messages.js)
export {
  formatThreadBindingDisabledError,
  resolveThreadBindingEffectiveExpiresAt,
  resolveThreadBindingIdleTimeoutMs,
  resolveThreadBindingIdleTimeoutMsForChannel,
  resolveThreadBindingLifecycle,
  resolveThreadBindingMaxAgeMs,
  resolveThreadBindingMaxAgeMsForChannel,
  resolveThreadBindingsEnabled,
  resolveThreadBindingSpawnPolicy,
  type ThreadBindingSpawnKind,
  type ThreadBindingSpawnPolicy,
} from "../channels/thread-bindings-policy.js";
// [reconcile] dropped re-export (gutted source: ../channels/plugins/binding-types.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/stateful-target-drivers.js)
export {
  type BindingStatus,
  type BindingTargetKind,
  type ConversationRef,
  SessionBindingError,
  type SessionBindingAdapter,
  type SessionBindingAdapterCapabilities,
  type SessionBindingBindInput,
  type SessionBindingCapabilities,
  type SessionBindingPlacement,
  type SessionBindingRecord,
  type SessionBindingService,
  type SessionBindingUnbindInput,
  getSessionBindingService,
  isSessionBindingError,
  registerSessionBindingAdapter,
  unregisterSessionBindingAdapter,
} from "../infra/outbound/session-binding-service.js";
export { __testing } from "../infra/outbound/session-binding-service.js";
export * from "../pairing/pairing-challenge.js";
export { resolvePairingIdLabel } from "../pairing/pairing-labels.js";
export * from "../pairing/pairing-messages.js";
export * from "../pairing/pairing-store.js";
// [reconcile] dropped re-export (gutted source: ../plugins/conversation-binding.js)
export { resolvePinnedMainDmOwnerFromAllowlist } from "../security/dm-policy-shared.js";
