// Public agent/model/runtime helpers for plugins that integrate with core agent flows.

export * from "../agents/agent-scope.js";
export * from "../agents/current-time.js";
export * from "../agents/date-time.js";
// STRIPPED: export * from "../agents/defaults.js";
export * from "../agents/identity-avatar.js";
export * from "../agents/identity.js";
// STRIPPED: export * from "../agents/model-auth-markers.js";
// STRIPPED: export * from "../agents/model-auth.js";
// STRIPPED: export * from "../agents/model-catalog.js";
// STRIPPED: export * from "../agents/model-selection.js";
// STRIPPED: export * from "../agents/pi-embedded-block-chunker.js";
// STRIPPED: export * from "../agents/pi-embedded-utils.js";
// STRIPPED: export * from "../agents/provider-id.js";
// STRIPPED: export * from "../agents/sandbox-paths.js";
export * from "../agents/schema/typebox.js";
// STRIPPED: export * from "../agents/sglang-defaults.js";
export * from "../agents/tools/common.js";
// STRIPPED: export * from "../agents/tools/web-guarded-fetch.js";
// STRIPPED: export * from "../agents/tools/web-shared.js";
// STRIPPED: export * from "../agents/tools/web-fetch-utils.js";
// STRIPPED: export * from "../agents/vllm-defaults.js";
// Intentional public runtime surface: channel plugins use ingress agent helpers directly.
// STRIPPED: export * from "../agents/agent-command.js";
export * from "../tts/tts.js";

// STRIPPED: export {
//   CLAUDE_CLI_PROFILE_ID,
//   CODEX_CLI_PROFILE_ID,
//   dedupeProfileIds,
//   listProfilesForProvider,
//   markAuthProfileGood,
//   setAuthProfileOrder,
//   upsertAuthProfile,
//   upsertAuthProfileWithLock,
//   repairOAuthProfileIdMismatch,
//   suggestOAuthProfileIdForLegacyDefault,
//   clearRuntimeAuthProfileStoreSnapshots,
//   ensureAuthProfileStore,
//   loadAuthProfileStoreForSecretsRuntime,
//   loadAuthProfileStoreForRuntime,
//   replaceRuntimeAuthProfileStoreSnapshots,
//   loadAuthProfileStore,
//   saveAuthProfileStore,
//   calculateAuthProfileCooldownMs,
//   clearAuthProfileCooldown,
//   clearExpiredCooldowns,
//   getSoonestCooldownExpiry,
//   isProfileInCooldown,
//   markAuthProfileCooldown,
//   markAuthProfileFailure,
//   markAuthProfileUsed,
//   resolveProfilesUnavailableReason,
//   resolveProfileUnusableUntilForDisplay,
//   resolveApiKeyForProfile,
//   resolveAuthProfileDisplayLabel,
//   formatAuthDoctorHint,
//   resolveAuthProfileEligibility,
//   resolveAuthProfileOrder,
//   resolveAuthStorePathForDisplay,
// } from "../agents/auth-profiles.js";
// STRIPPED: export type {
//   ApiKeyCredential,
//   AuthCredentialReasonCode,
//   AuthProfileCredential,
//   AuthProfileEligibilityReasonCode,
//   AuthProfileFailureReason,
//   AuthProfileIdRepairResult,
//   AuthProfileStore,
//   OAuthCredential,
//   ProfileUsageStats,
//   TokenCredential,
//   TokenExpiryState,
// } from "../agents/auth-profiles.js";
