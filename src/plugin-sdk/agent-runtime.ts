// Public agent/model/runtime helpers for plugins that integrate with core agent flows.

export * from "../agents/agent-scope.js";
export * from "../agents/current-time.js";
export * from "../agents/date-time.js";
export * from "../agents/defaults.js";
export * from "../agents/identity-avatar.js";
export * from "../agents/identity.js";
export * from "../agents/model-auth-markers.js";
export * from "../agents/model-auth.js";
// [reconcile] dropped re-export (gutted source: ../agents/model-catalog.js)
// [reconcile] dropped re-export (gutted source: ../agents/model-selection.js)
// [reconcile] dropped re-export (gutted source: ../agents/simple-completion-runtime.js)
// [reconcile] dropped re-export (gutted source: ../agents/pi-embedded-block-chunker.js)
// [reconcile] dropped re-export (gutted source: ../agents/pi-embedded-utils.js)
// [reconcile] dropped re-export (gutted source: ../agents/provider-id.js)
export * from "../agents/sandbox-paths.js";
export * from "../agents/schema/typebox.js";
export * from "../agents/tools/common.js";
// [reconcile] dropped re-export (gutted source: ../agents/tools/web-guarded-fetch.js)
// [reconcile] dropped re-export (gutted source: ../agents/tools/web-shared.js)
// [reconcile] dropped re-export (gutted source: ../agents/tools/web-fetch-utils.js)
// Intentional public runtime surface: channel plugins use ingress agent helpers directly.
// [reconcile] dropped re-export (gutted source: ../agents/agent-command.js)
export * from "../tts/tts.js";

export {
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  dedupeProfileIds,
  listProfilesForProvider,
  markAuthProfileGood,
  setAuthProfileOrder,
  upsertAuthProfile,
  upsertAuthProfileWithLock,
  repairOAuthProfileIdMismatch,
  suggestOAuthProfileIdForLegacyDefault,
  clearRuntimeAuthProfileStoreSnapshots,
  ensureAuthProfileStore,
  loadAuthProfileStoreForSecretsRuntime,
  loadAuthProfileStoreForRuntime,
  replaceRuntimeAuthProfileStoreSnapshots,
  loadAuthProfileStore,
  saveAuthProfileStore,
  calculateAuthProfileCooldownMs,
  clearAuthProfileCooldown,
  clearExpiredCooldowns,
  getSoonestCooldownExpiry,
  isProfileInCooldown,
  markAuthProfileCooldown,
  markAuthProfileFailure,
  markAuthProfileUsed,
  resolveProfilesUnavailableReason,
  resolveProfileUnusableUntilForDisplay,
  resolveApiKeyForProfile,
  resolveAuthProfileDisplayLabel,
  formatAuthDoctorHint,
  resolveAuthProfileEligibility,
  resolveAuthProfileOrder,
  resolveAuthStorePathForDisplay,
} from "../agents/auth-profiles.js";
export type {
  ApiKeyCredential,
  AuthCredentialReasonCode,
  AuthProfileCredential,
  AuthProfileEligibilityReasonCode,
  AuthProfileFailureReason,
  AuthProfileIdRepairResult,
  AuthProfileStore,
  OAuthCredential,
  ProfileUsageStats,
  TokenCredential,
  TokenExpiryState,
} from "../agents/auth-profiles.js";
