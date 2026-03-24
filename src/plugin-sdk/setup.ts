import type { RemoteClawConfig } from "../config/config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export type PromptAccountIdParams = {
  cfg: RemoteClawConfig;
  prompter: WizardPrompter;
  label: string;
  currentId?: string;
  listAccountIds: (cfg: RemoteClawConfig) => string[];
  defaultAccountId: string;
};

export async function promptAccountId(params: PromptAccountIdParams): Promise<string> {
  const existingIds = params.listAccountIds(params.cfg);
  const initial = params.currentId?.trim() || params.defaultAccountId || DEFAULT_ACCOUNT_ID;
  const choice = await params.prompter.select({
    message: `${params.label} account`,
    options: [
      ...existingIds.map((id) => ({
        value: id,
        label: id === DEFAULT_ACCOUNT_ID ? "default (primary)" : id,
      })),
      { value: "__new__", label: "Add a new account" },
    ],
    initialValue: initial,
  });

  export {
    applyAccountNameToChannelSection,
    applySetupAccountConfigPatch,
    createEnvPatchedAccountSetupAdapter,
    createPatchedAccountSetupAdapter,
    migrateBaseNameToDefaultAccount,
    patchScopedAccountConfig,
    prepareScopedSetupConfig,
  } from "../channels/plugins/setup-helpers.js";
  export {
    addWildcardAllowFrom,
    buildSingleChannelSecretPromptState,
    createAccountScopedAllowFromSection,
    createAccountScopedGroupAccessSection,
    createLegacyCompatChannelDmPolicy,
    createNestedChannelAllowFromSetter,
    createNestedChannelDmPolicy,
    createNestedChannelDmPolicySetter,
    createTopLevelChannelAllowFromSetter,
    createTopLevelChannelDmPolicy,
    createTopLevelChannelDmPolicySetter,
    createTopLevelChannelGroupPolicySetter,
    mergeAllowFromEntries,
    normalizeAllowFromEntries,
    noteChannelLookupFailure,
    noteChannelLookupSummary,
    parseMentionOrPrefixedId,
    parseSetupEntriesAllowingWildcard,
    parseSetupEntriesWithParser,
    patchNestedChannelConfigSection,
    patchTopLevelChannelConfigSection,
    patchChannelConfigForAccount,
    promptLegacyChannelAllowFrom,
    promptLegacyChannelAllowFromForAccount,
    promptParsedAllowFromForScopedChannel,
    promptSingleChannelSecretInput,
    promptResolvedAllowFrom,
    resolveEntriesWithOptionalToken,
    resolveSetupAccountId,
    resolveGroupAllowlistWithLookupNotes,
    runSingleChannelSecretStep,
    setAccountDmAllowFromForChannel,
    setAccountGroupPolicyForChannel,
    setChannelDmPolicyWithAllowFrom,
    setLegacyChannelDmPolicyWithAllowFrom,
    setNestedChannelAllowFrom,
    setNestedChannelDmPolicyWithAllowFrom,
    setSetupChannelEnabled,
    setTopLevelChannelAllowFrom,
    setTopLevelChannelDmPolicyWithAllowFrom,
    setTopLevelChannelGroupPolicy,
    splitSetupEntries,
  } from "../channels/plugins/setup-wizard-helpers.js";
  export { createAllowlistSetupWizardProxy } from "../channels/plugins/setup-wizard-proxy.js";

  const entered = await params.prompter.text({
    message: `New ${params.label} account id`,
    validate: (value) => (value?.trim() ? undefined : "Required"),
  });
  const normalized = normalizeAccountId(String(entered));
  if (String(entered).trim() !== normalized) {
    await params.prompter.note(
      `Normalized account id to "${normalized}".`,
      `${params.label} account`,
    );
  }
  return normalized;
}
