import { type ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  DEFAULT_ACCOUNT_ID,
  hasConfiguredSecretInput,
  type OpenClawConfig,
  patchChannelConfigForAccount,
  setChannelDmPolicyWithAllowFrom,
  setSetupChannelEnabled,
  splitSetupEntries,
} from "../../../src/plugin-sdk-internal/setup.js";
import type {
  ChannelSetupDmPolicy,
  ChannelSetupWizard,
} from "../../../src/plugin-sdk-internal/setup.js";
import { inspectTelegramAccount } from "./account-inspect.js";
import { listTelegramAccountIds, resolveTelegramAccount } from "./accounts.js";
import {
  createTelegramSetupWizardBase,
  parseTelegramAllowFromId,
  telegramSetupAdapter,
} from "./setup-core.js";

export const telegramSetupWizard: ChannelSetupWizard = createTelegramSetupWizardBase({
  inspectToken: ({ cfg, accountId }) => {
    const resolved = resolveTelegramAccount({ cfg, accountId });
    const hasConfiguredBotToken = hasConfiguredSecretInput(resolved.config.botToken);
    const hasConfiguredValue = hasConfiguredBotToken || Boolean(resolved.config.tokenFile?.trim());
    return {
      accountConfigured: Boolean(resolved.token) || hasConfiguredValue,
      hasConfiguredValue,
      resolvedValue: resolved.token?.trim() || undefined,
      envValue:
        accountId === DEFAULT_ACCOUNT_ID
          ? process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined
          : undefined,
    };
  },
});

export { parseTelegramAllowFromId, telegramSetupAdapter };
