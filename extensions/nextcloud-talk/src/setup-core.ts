import type { ChannelSetupAdapter, ChannelSetupInput } from "remoteclaw/plugin-sdk/channel-setup";
import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "remoteclaw/plugin-sdk/routing";
import {
  patchScopedAccountConfig,
  prepareScopedSetupConfig,
} from "../../../src/channels/plugins/setup-helpers.js";
import {
  applyAccountNameToChannelSection,
  patchScopedAccountConfig,
} from "../../../src/channels/plugins/setup-helpers.js";
import {
  mergeAllowFromEntries,
  createTopLevelChannelDmPolicy,
  promptParsedAllowFromForAccount,
  resolveSetupAccountId,
  setSetupChannelEnabled,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "../../../src/channels/plugins/setup-wizard-helpers.js";
import type { ChannelSetupDmPolicy } from "../../../src/channels/plugins/setup-wizard-types.js";
import { type ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { ChannelSetupAdapter } from "../../../src/channels/plugins/types.adapters.js";
import type { ChannelSetupInput } from "../../../src/channels/plugins/types.core.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import {
  listNextcloudTalkAccountIds,
  resolveDefaultNextcloudTalkAccountId,
  resolveNextcloudTalkAccount,
} from "./accounts.js";
import type { CoreConfig, DmPolicy } from "./types.js";

const channel = "nextcloud-talk" as const;

type NextcloudSetupInput = ChannelSetupInput & {
  baseUrl?: string;
  secret?: string;
  secretFile?: string;
};
type NextcloudTalkSection = NonNullable<CoreConfig["channels"]>["nextcloud-talk"];

export function normalizeNextcloudTalkBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export function validateNextcloudTalkBaseUrl(value: string): string | undefined {
  if (!value) {
    return "Required";
  }
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return "URL must start with http:// or https://";
  }
  return undefined;
}

function setNextcloudTalkDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy): CoreConfig {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel,
    dmPolicy,
  }) as CoreConfig;
}

export function setNextcloudTalkAccountConfig(
  cfg: CoreConfig,
  accountId: string,
  updates: Record<string, unknown>,
): CoreConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch: updates,
  }) as CoreConfig;
}

export function clearNextcloudTalkAccountFields(
  cfg: CoreConfig,
  accountId: string,
  fields: string[],
): CoreConfig {
  const section = cfg.channels?.["nextcloud-talk"];
  if (!section) {
    return cfg;
  }

  if (accountId === DEFAULT_ACCOUNT_ID) {
    const nextSection = { ...section } as Record<string, unknown>;
    for (const field of fields) {
      delete nextSection[field];
    }
    return {
      ...cfg,
      channels: {
        ...(cfg.channels ?? {}),
        "nextcloud-talk": nextSection as NextcloudTalkSection,
      },
    } as CoreConfig;
  }

  const currentAccount = section.accounts?.[accountId];
  if (!currentAccount) {
    return cfg;
  }

  const nextAccount = { ...currentAccount } as Record<string, unknown>;
  for (const field of fields) {
    delete nextAccount[field];
  }
  return {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
      "nextcloud-talk": {
        ...section,
        accounts: {
          ...section.accounts,
          [accountId]: nextAccount as NonNullable<typeof section.accounts>[string],
        },
      },
    },
  } as CoreConfig;
}

async function promptNextcloudTalkAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<CoreConfig> {
  return await promptParsedAllowFromForAccount({
    cfg: params.cfg,
    accountId: params.accountId,
    defaultAccountId: params.accountId,
    prompter: params.prompter,
    noteTitle: "Nextcloud Talk user id",
    noteLines: [
      "1) Check the Nextcloud admin panel for user IDs",
      "2) Or look at the webhook payload logs when someone messages",
      "3) User IDs are typically lowercase usernames in Nextcloud",
      `Docs: ${formatDocsLink("/channels/nextcloud-talk", "nextcloud-talk")}`,
    ],
    message: "Nextcloud Talk allowFrom (user id)",
    placeholder: "username",
    parseEntries: (raw) => ({
      entries: String(raw)
        .split(/[\n,;]+/g)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    }),
    getExistingAllowFrom: ({ cfg, accountId }) =>
      resolveNextcloudTalkAccount({ cfg, accountId }).config.allowFrom ?? [],
    mergeEntries: ({ existing, parsed }) =>
      mergeAllowFromEntries(
        existing.map((value) => String(value).trim().toLowerCase()),
        parsed,
      ),
    applyAllowFrom: ({ cfg, accountId, allowFrom }) =>
      setNextcloudTalkAccountConfig(cfg, accountId, {
        dmPolicy: "allowlist",
        allowFrom,
      }),
  });
}

async function promptNextcloudTalkAllowFromForAccount(params: {
  cfg: RemoteClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<RemoteClawConfig> {
  const accountId = resolveSetupAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultNextcloudTalkAccountId(params.cfg as CoreConfig),
  });
  return await promptNextcloudTalkAllowFrom({
    cfg: params.cfg as CoreConfig,
    prompter: params.prompter,
    accountId,
  });
}

const nextcloudTalkDmPolicy: ChannelSetupDmPolicy = {
  label: "Nextcloud Talk",
  channel,
  policyKey: "channels.nextcloud-talk.dmPolicy",
  allowFromKey: "channels.nextcloud-talk.allowFrom",
  getCurrent: (cfg) => cfg.channels?.["nextcloud-talk"]?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setNextcloudTalkDmPolicy(cfg as CoreConfig, policy as DmPolicy),
  promptAllowFrom: promptNextcloudTalkAllowFromForAccount,
};

export const nextcloudTalkSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    prepareScopedSetupConfig({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ accountId, input }) => {
    const setupInput = input as NextcloudSetupInput;
    if (setupInput.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
      return "NEXTCLOUD_TALK_BOT_SECRET can only be used for the default account.";
    }
    if (!setupInput.useEnv && !setupInput.secret && !setupInput.secretFile) {
      return "Nextcloud Talk requires bot secret or --secret-file (or --use-env).";
    }
    if (!setupInput.baseUrl) {
      return "Nextcloud Talk requires --base-url.";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const setupInput = input as NextcloudSetupInput;
    const namedConfig = prepareScopedSetupConfig({
      cfg,
      channelKey: channel,
      accountId,
      name: setupInput.name,
    });
    const next = setupInput.useEnv
      ? clearNextcloudTalkAccountFields(namedConfig as CoreConfig, accountId, [
          "botSecret",
          "botSecretFile",
        ])
      : namedConfig;
    const patch = {
      baseUrl: normalizeNextcloudTalkBaseUrl(setupInput.baseUrl),
      ...(setupInput.useEnv
        ? {}
        : setupInput.secretFile
          ? { botSecretFile: setupInput.secretFile }
          : setupInput.secret
            ? { botSecret: setupInput.secret }
            : {}),
    };
    return setNextcloudTalkAccountConfig(next as CoreConfig, accountId, patch);
  },
};
