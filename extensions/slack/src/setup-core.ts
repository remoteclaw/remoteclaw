import { createPatchedAccountSetupAdapter } from "../../../src/channels/plugins/setup-helpers.js";
import { createAllowlistSetupWizardProxy } from "../../../src/channels/plugins/setup-wizard-proxy.js";
import {
  createAllowlistSetupWizardProxy,
  DEFAULT_ACCOUNT_ID,
  createEnvPatchedAccountSetupAdapter,
  hasConfiguredSecretInput,
  type OpenClawConfig,
  noteChannelLookupFailure,
  noteChannelLookupSummary,
  parseMentionOrPrefixedId,
  patchChannelConfigForAccount,
  setAccountGroupPolicyForChannel,
  setLegacyChannelDmPolicyWithAllowFrom,
  setSetupChannelEnabled,
} from "remoteclaw/plugin-sdk/setup";
import {
  type ChannelSetupAdapter,
  type ChannelSetupDmPolicy,
  type ChannelSetupWizard,
  type ChannelSetupWizardAllowFromEntry,
} from "openclaw/plugin-sdk/setup";
import { createPatchedAccountSetupAdapter } from "../../../src/channels/plugins/setup-helpers.js";
import { createAllowlistSetupWizardProxy } from "../../../src/channels/plugins/setup-wizard-proxy.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import { inspectSlackAccount } from "./account-inspect.js";
import { listSlackAccountIds, resolveSlackAccount, type ResolvedSlackAccount } from "./accounts.js";
import {
  buildSlackSetupLines,
  isSlackSetupAccountConfigured,
  setSlackChannelAllowlist,
  SLACK_CHANNEL as channel,
} from "./shared.js";

function enableSlackAccount(cfg: RemoteClawConfig, accountId: string): RemoteClawConfig {
  return patchChannelConfigForAccount({
    cfg,
    channel,
    accountId,
    patch: { enabled: true },
  });
}

function createSlackTokenCredential(params: {
  inputKey: "botToken" | "appToken";
  providerHint: "slack-bot" | "slack-app";
  credentialLabel: string;
  preferredEnvVar: "SLACK_BOT_TOKEN" | "SLACK_APP_TOKEN";
  keepPrompt: string;
  inputPrompt: string;
}) {
  return {
    inputKey: params.inputKey,
    providerHint: params.providerHint,
    credentialLabel: params.credentialLabel,
    preferredEnvVar: params.preferredEnvVar,
    envPrompt: `${params.preferredEnvVar} detected. Use env var?`,
    keepPrompt: params.keepPrompt,
    inputPrompt: params.inputPrompt,
    allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
    inspect: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) => {
      const resolved = resolveSlackAccount({ cfg, accountId });
      const configuredValue =
        params.inputKey === "botToken" ? resolved.config.botToken : resolved.config.appToken;
      const resolvedValue = params.inputKey === "botToken" ? resolved.botToken : resolved.appToken;
      return {
        accountConfigured: Boolean(resolvedValue) || hasConfiguredSecretInput(configuredValue),
        hasConfiguredValue: hasConfiguredSecretInput(configuredValue),
        resolvedValue: resolvedValue?.trim() || undefined,
        envValue:
          accountId === DEFAULT_ACCOUNT_ID
            ? process.env[params.preferredEnvVar]?.trim()
            : undefined,
      };
    },
    applyUseEnv: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
      enableSlackAccount(cfg, accountId),
    applySet: ({
      cfg,
      accountId,
      value,
    }: {
      cfg: OpenClawConfig;
      accountId: string;
      value: unknown;
    }) =>
      patchChannelConfigForAccount({
        cfg,
        channel,
        accountId,
        patch: {
          enabled: true,
          [params.inputKey]: value,
        },
      }),
  };
}

export const slackSetupAdapter: ChannelSetupAdapter = createEnvPatchedAccountSetupAdapter({
  channelKey: channel,
  defaultAccountOnlyEnvError: "Slack env tokens can only be used for the default account.",
  missingCredentialError: "Slack requires --bot-token and --app-token (or --use-env).",
  hasCredentials: (input) => Boolean(input.botToken && input.appToken),
  buildPatch: (input) => ({
    ...(input.botToken ? { botToken: input.botToken } : {}),
    ...(input.appToken ? { appToken: input.appToken } : {}),
  }),
});

export function createSlackSetupWizardBase(handlers: {
  promptAllowFrom: NonNullable<ChannelSetupDmPolicy["promptAllowFrom"]>;
  resolveAllowFromEntries: NonNullable<
    NonNullable<ChannelSetupWizard["allowFrom"]>["resolveEntries"]
  >;
  resolveGroupAllowlist: NonNullable<
    NonNullable<NonNullable<ChannelSetupWizard["groupAccess"]>["resolveAllowlist"]>
  >;
}) {
  const slackDmPolicy: ChannelSetupDmPolicy = {
    label: "Slack",
    channel,
    policyKey: "channels.slack.dmPolicy",
    allowFromKey: "channels.slack.allowFrom",
    getCurrent: (cfg: RemoteClawConfig) =>
      cfg.channels?.slack?.dmPolicy ?? cfg.channels?.slack?.dm?.policy ?? "pairing",
    setPolicy: (cfg: RemoteClawConfig, policy) =>
      setLegacyChannelDmPolicyWithAllowFrom({
        cfg,
        channel,
        dmPolicy: policy,
      }),
    promptAllowFrom: handlers.promptAllowFrom,
  };

  return {
    channel,
    status: {
      configuredLabel: "configured",
      unconfiguredLabel: "needs tokens",
      configuredHint: "configured",
      unconfiguredHint: "needs tokens",
      configuredScore: 2,
      unconfiguredScore: 1,
      resolveConfigured: ({ cfg }) =>
        listSlackAccountIds(cfg).some((accountId) => {
          const account = inspectSlackAccount({ cfg, accountId });
          return account.configured;
        }),
    },
    introNote: {
      title: "Slack socket mode tokens",
      lines: buildSlackSetupLines(),
      shouldShow: ({ cfg, accountId }) =>
        !isSlackSetupAccountConfigured(resolveSlackAccount({ cfg, accountId })),
    },
    envShortcut: {
      prompt: "SLACK_BOT_TOKEN + SLACK_APP_TOKEN detected. Use env vars?",
      preferredEnvVar: "SLACK_BOT_TOKEN",
      isAvailable: ({ cfg, accountId }) =>
        accountId === DEFAULT_ACCOUNT_ID &&
        Boolean(process.env.SLACK_BOT_TOKEN?.trim()) &&
        Boolean(process.env.SLACK_APP_TOKEN?.trim()) &&
        !isSlackSetupAccountConfigured(resolveSlackAccount({ cfg, accountId })),
      apply: ({ cfg, accountId }) => enableSlackAccount(cfg, accountId),
    },
    credentials: [
      {
        inputKey: "botToken",
        providerHint: "slack-bot",
        credentialLabel: "Slack bot token",
        preferredEnvVar: "SLACK_BOT_TOKEN",
        envPrompt: "SLACK_BOT_TOKEN detected. Use env var?",
        keepPrompt: "Slack bot token already configured. Keep it?",
        inputPrompt: "Enter Slack bot token (xoxb-...)",
        allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
        inspect: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId: string }) => {
          const resolved = resolveSlackAccount({ cfg, accountId });
          return {
            accountConfigured:
              Boolean(resolved.botToken) || hasConfiguredSecretInput(resolved.config.botToken),
            hasConfiguredValue: hasConfiguredSecretInput(resolved.config.botToken),
            resolvedValue: resolved.botToken?.trim() || undefined,
            envValue:
              accountId === DEFAULT_ACCOUNT_ID ? process.env.SLACK_BOT_TOKEN?.trim() : undefined,
          };
        },
        applyUseEnv: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId: string }) =>
          enableSlackAccount(cfg, accountId),
        applySet: ({
          cfg,
          accountId,
          value,
        }: {
          cfg: RemoteClawConfig;
          accountId: string;
          value: unknown;
        }) =>
          patchChannelConfigForAccount({
            cfg,
            channel,
            accountId,
            patch: {
              enabled: true,
              botToken: value,
            },
          }),
      },
      {
        inputKey: "appToken",
        providerHint: "slack-app",
        credentialLabel: "Slack app token",
        preferredEnvVar: "SLACK_APP_TOKEN",
        envPrompt: "SLACK_APP_TOKEN detected. Use env var?",
        keepPrompt: "Slack app token already configured. Keep it?",
        inputPrompt: "Enter Slack app token (xapp-...)",
        allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
        inspect: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId: string }) => {
          const resolved = resolveSlackAccount({ cfg, accountId });
          return {
            accountConfigured:
              Boolean(resolved.appToken) || hasConfiguredSecretInput(resolved.config.appToken),
            hasConfiguredValue: hasConfiguredSecretInput(resolved.config.appToken),
            resolvedValue: resolved.appToken?.trim() || undefined,
            envValue:
              accountId === DEFAULT_ACCOUNT_ID ? process.env.SLACK_APP_TOKEN?.trim() : undefined,
          };
        },
        applyUseEnv: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId: string }) =>
          enableSlackAccount(cfg, accountId),
        applySet: ({
          cfg,
          accountId,
          value,
        }: {
          cfg: RemoteClawConfig;
          accountId: string;
          value: unknown;
        }) =>
          patchChannelConfigForAccount({
            cfg,
            channel,
            accountId,
            patch: {
              enabled: true,
              appToken: value,
            },
          }),
      },
    ],
    dmPolicy: slackDmPolicy,
    allowFrom: {
      helpTitle: "Slack allowlist",
      helpLines: [
        "Allowlist Slack DMs by username (we resolve to user ids).",
        "Examples:",
        "- U12345678",
        "- @alice",
        "Multiple entries: comma-separated.",
        `Docs: ${formatDocsLink("/slack", "slack")}`,
      ],
      credentialInputKey: "botToken",
      message: "Slack allowFrom (usernames or ids)",
      placeholder: "@alice, U12345678",
      invalidWithoutCredentialNote: "Slack token missing; use user ids (or mention form) only.",
      parseId: (value: string) =>
        parseMentionOrPrefixedId({
          value,
          mentionPattern: /^<@([A-Z0-9]+)>$/i,
          prefixPattern: /^(slack:|user:)/i,
          idPattern: /^[A-Z][A-Z0-9]+$/i,
          normalizeId: (id) => id.toUpperCase(),
        }),
      resolveEntries: async ({
        cfg,
        accountId,
        credentialValues,
        entries,
      }: {
        cfg: RemoteClawConfig;
        accountId: string;
        credentialValues: { botToken?: string };
        entries: string[];
      }) => await handlers.resolveAllowFromEntries({ cfg, accountId, credentialValues, entries }),
      apply: ({
        cfg,
        accountId,
        allowFrom,
      }: {
        cfg: RemoteClawConfig;
        accountId: string;
        allowFrom: string[];
      }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: { dmPolicy: "allowlist", allowFrom },
        }),
    },
    groupAccess: {
      label: "Slack channels",
      placeholder: "#general, #private, C123",
      currentPolicy: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId: string }) =>
        resolveSlackAccount({ cfg, accountId }).config.groupPolicy ?? "allowlist",
      currentEntries: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId: string }) =>
        Object.entries(resolveSlackAccount({ cfg, accountId }).config.channels ?? {})
          .filter(([, value]) => value?.allow !== false && value?.enabled !== false)
          .map(([key]) => key),
      updatePrompt: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId: string }) =>
        Boolean(resolveSlackAccount({ cfg, accountId }).config.channels),
      setPolicy: ({
        cfg,
        accountId,
        policy,
      }: {
        cfg: RemoteClawConfig;
        accountId: string;
        policy: "open" | "allowlist" | "disabled";
      }) =>
        setAccountGroupPolicyForChannel({
          cfg,
          channel,
          accountId,
          groupPolicy: policy,
        }),
      resolveAllowlist: async ({
        cfg,
        accountId,
        credentialValues,
        entries,
        prompter,
      }: {
        cfg: RemoteClawConfig;
        accountId: string;
        credentialValues: { botToken?: string };
        entries: string[];
        prompter: { note: (message: string, title?: string) => Promise<void> };
      }) => {
        try {
          const wizard = (await loadWizard()).slackSetupWizard;
          if (!wizard.groupAccess?.resolveAllowlist) {
            return entries;
          }
          return await wizard.groupAccess.resolveAllowlist({
            cfg,
            accountId,
            credentialValues,
            entries,
            prompter,
          });
        } catch (error) {
          await noteChannelLookupFailure({
            prompter,
            label: "Slack channels",
            error,
          });
          await noteChannelLookupSummary({
            prompter,
            label: "Slack channels",
            resolvedSections: [],
            unresolved: entries,
          });
          return entries;
        }
      },
      applyAllowlist: ({
        cfg,
        accountId,
        resolved,
      }: {
        cfg: RemoteClawConfig;
        accountId: string;
        resolved: unknown;
      }) => setSlackChannelAllowlist(cfg, accountId, resolved as string[]),
    },
    disable: (cfg: RemoteClawConfig) => setSetupChannelEnabled(cfg, channel, false),
  } satisfies ChannelSetupWizard;
}
export function createSlackSetupWizardProxy(
  loadWizard: () => Promise<{ slackSetupWizard: ChannelSetupWizard }>,
) {
  return createAllowlistSetupWizardProxy({
    loadWizard: async () => (await loadWizard()).slackSetupWizard,
    createBase: createSlackSetupWizardBase,
    fallbackResolvedGroupAllowlist: (entries) => entries,
  });
}
