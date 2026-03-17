import type { ChannelOnboardingDmPolicy } from "../../../src/channels/plugins/onboarding-types.js";
import {
  type OpenClawConfig,
  promptLegacyChannelAllowFrom,
  resolveSetupAccountId,
  type WizardPrompter,
} from "openclaw/plugin-sdk/setup";
import { type ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
import { formatDocsLink } from "../../../src/terminal/links.js";
import { resolveDefaultDiscordAccountId, resolveDiscordAccount } from "./accounts.js";
import { normalizeDiscordSlug } from "./monitor/allow-list.js";
import {
  resolveDiscordChannelAllowlist,
  type DiscordChannelResolution,
} from "./resolve-channels.js";
import { resolveDiscordUserAllowlist } from "./resolve-users.js";
import {
  createDiscordSetupWizardBase,
  DISCORD_TOKEN_HELP_LINES,
  parseDiscordAllowFromId,
  setDiscordGuildChannelAllowlist,
} from "./setup-core.js";
import {
  promptLegacyChannelAllowFromForAccount,
  resolveEntriesWithOptionalToken,
} from "./setup-runtime-helpers.js";
import { resolveDiscordToken } from "./token.js";

const channel = "discord" as const;

async function resolveDiscordAllowFromEntries(params: { token?: string; entries: string[] }) {
  if (!params.token?.trim()) {
    return params.entries.map((input) => ({
      input,
      resolved: false,
      id: null,
    }));
  }
  const resolved = await resolveDiscordUserAllowlist({
    token: params.token,
    entries: params.entries,
  });
  return resolved.map((entry) => ({
    input: entry.input,
    resolved: entry.resolved,
    id: entry.id ?? null,
  }));
}

async function promptDiscordAllowFrom(params: {
  cfg: RemoteClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<RemoteClawConfig> {
  const accountId = resolveSetupAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultDiscordAccountId(params.cfg),
  });
  const resolved = resolveDiscordAccount({ cfg: params.cfg, accountId });
  return promptLegacyChannelAllowFrom({
    cfg: params.cfg,
    prompter: params.prompter,
    accountId: params.accountId,
    noteTitle: "Discord allowlist",
    noteLines: [
      "Allowlist Discord DMs by username (we resolve to user ids).",
      "Examples:",
      "- 123456789012345678",
      "- @alice",
      "- alice#1234",
      "Multiple entries: comma-separated.",
      `Docs: ${formatDocsLink("/discord", "discord")}`,
    ],
    message: "Discord allowFrom (usernames or ids)",
    placeholder: "@alice, 123456789012345678",
    parseId: parseDiscordAllowFromId,
    invalidWithoutTokenNote: "Bot token missing; use numeric user ids (or mention form) only.",
    resolveExisting: (accountId, cfg) => {
      const account = resolveDiscordSetupAccountConfig({ cfg, accountId }).config;
      return account.allowFrom ?? account.dm?.allowFrom ?? [];
    },
    resolveToken: (accountId) => resolveDiscordToken(params.cfg, { accountId }).token,
    resolveEntries: async ({ token, entries }) =>
      (
        await resolveDiscordUserAllowlist({
          token,
          entries,
        })
      ).map((entry) => ({
        input: entry.input,
        resolved: entry.resolved,
        id: entry.id ?? null,
      })),
  });
}

async function resolveDiscordGroupAllowlist(params: {
  cfg: RemoteClawConfig;
  accountId: string;
  credentialValues: { token?: string };
  entries: string[];
}) {
  return await resolveEntriesWithOptionalToken({
    token:
      resolveDiscordToken(params.cfg, { accountId: params.accountId }).token ||
      (typeof params.credentialValues.token === "string" ? params.credentialValues.token : ""),
    entries: params.entries,
    buildWithoutToken: (input) => ({
      input,
      resolved: false,
    }),
    resolveEntries: async ({ token, entries }) =>
      await resolveDiscordChannelAllowlist({
        token,
        entries,
      }),
  });
}

async function resolveDiscordGroupAllowlist(params: {
  cfg: OpenClawConfig;
  accountId: string;
  credentialValues: { token?: string };
  entries: string[];
}) {
  const token =
    resolveDiscordAccount({ cfg: params.cfg, accountId: params.accountId }).token ||
    (typeof params.credentialValues.token === "string" ? params.credentialValues.token : "");
  if (!token || params.entries.length === 0) {
    return params.entries.map((input) => ({
      input,
      resolved: false,
    }));
  }
  return await resolveDiscordChannelAllowlist({
    token,
    entries: params.entries,
  });
}

export const discordSetupWizard: ChannelSetupWizard = createDiscordSetupWizardBase(async () => ({
  discordSetupWizard: {
    dmPolicy: {
      promptAllowFrom: promptDiscordAllowFrom,
    },
    groupAccess: {
      resolveAllowlist: async ({ cfg, accountId, credentialValues, entries }) =>
        await resolveDiscordGroupAllowlist({
          cfg,
          accountId,
          credentialValues,
          entries,
        }),
    },
    allowFrom: {
      resolveEntries: async ({ cfg, accountId, credentialValues, entries }) =>
        await resolveDiscordAllowFromEntries({
          token:
            resolveDiscordAccount({ cfg, accountId }).token ||
            (typeof credentialValues.token === "string" ? credentialValues.token : ""),
          entries,
        }),
    },
  } as ChannelSetupWizard,
}));
