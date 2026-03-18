import { type ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  createAllowFromSection,
  DEFAULT_ACCOUNT_ID,
  hasConfiguredSecretInput,
  type RemoteClawConfig,
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
  credentials: [
    {
      inputKey: "token",
      providerHint: channel,
      credentialLabel: "Telegram bot token",
      preferredEnvVar: "TELEGRAM_BOT_TOKEN",
      helpTitle: "Telegram bot token",
      helpLines: TELEGRAM_TOKEN_HELP_LINES,
      envPrompt: "TELEGRAM_BOT_TOKEN detected. Use env var?",
      keepPrompt: "Telegram token already configured. Keep it?",
      inputPrompt: "Enter Telegram bot token",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const resolved = resolveTelegramAccount({ cfg, accountId });
        const hasConfiguredBotToken = hasConfiguredSecretInput(resolved.config.botToken);
        const hasConfiguredValue =
          hasConfiguredBotToken || Boolean(resolved.config.tokenFile?.trim());
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
    },
  ],
  allowFrom: createAllowFromSection({
    helpTitle: "Telegram user id",
    helpLines: TELEGRAM_USER_ID_HELP_LINES,
    credentialInputKey: "token",
    message: "Telegram allowFrom (numeric sender id; @username resolves to id)",
    placeholder: "@username",
    invalidWithoutCredentialNote:
      "Telegram token missing; use numeric sender ids (usernames require a bot token).",
    parseInputs: splitSetupEntries,
    parseId: parseTelegramAllowFromId,
    resolveEntries: async ({ credentialValues, entries }) =>
      resolveTelegramAllowFromEntries({
        credentialValue: credentialValues.token,
        entries,
      }),
    apply: async ({ cfg, accountId, allowFrom }) =>
      patchChannelConfigForAccount({
        cfg,
        channel,
        accountId,
        patch: { dmPolicy: "allowlist", allowFrom },
      }),
  }),
  dmPolicy,
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};

export { parseTelegramAllowFromId, telegramSetupAdapter };
