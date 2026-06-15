// Shared setup wizard/types/helpers for plugin and channel setup surfaces.

export type { RemoteClawConfig } from "../config/config.js";
export type { DmPolicy, GroupPolicy } from "../config/types.js";
export type { SecretInput } from "../config/types.secrets.js";
export type { WizardPrompter } from "../wizard/prompts.js";
export { WizardCancelledError } from "../wizard/prompts.js";
export type { ChannelSetupAdapter } from "../channels/plugins/types.adapters.js";
export type { ChannelSetupInput } from "../channels/plugins/types.core.js";
// [reconcile] dropped re-export (gutted source: ../channels/plugins/setup-wizard-types.js)

export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
export { formatCliCommand } from "../cli/command-format.js";
// [reconcile] dropped re-export (gutted source: ../plugins/setup-binary.js)
export { formatDocsLink } from "../terminal/links.js";
export { hasConfiguredSecretInput, normalizeSecretInputString } from "../config/types.secrets.js";
export { normalizeE164, pathExists } from "../utils.js";

export {
  moveSingleAccountChannelSectionToDefaultAccount,
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  createEnvPatchedAccountSetupAdapter,
  createSetupInputPresenceValidator,
  createPatchedAccountSetupAdapter,
  createZodSetupInputValidator,
  migrateBaseNameToDefaultAccount,
  patchScopedAccountConfig,
  prepareScopedSetupConfig,
} from "../channels/plugins/setup-helpers.js";
// [reconcile] dropped re-export (gutted source: ../channels/plugins/setup-wizard-helpers.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/setup-group-access.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/setup-wizard-proxy.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/setup-wizard-proxy.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/setup-wizard-binary.js)

export { formatResolvedUnresolvedNote } from "./resolution-notes.js";
