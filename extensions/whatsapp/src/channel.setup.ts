import {
  resolveWhatsAppGroupIntroHint,
  resolveWhatsAppGroupRequireMention,
  resolveWhatsAppGroupToolPolicy,
  type ChannelPlugin,
} from "../../../src/plugin-sdk-internal/whatsapp.js";
import {
  listWhatsAppAccountIds,
  resolveDefaultWhatsAppAccountId,
  resolveWhatsAppAccount,
  type ResolvedWhatsAppAccount,
} from "./accounts.js";
import { webAuthExists } from "./auth-store.js";
import { whatsappSetupWizardProxy } from "./plugin-shared.js";
import { whatsappSetupAdapter } from "./setup-core.js";

export const whatsappSetupPlugin: ChannelPlugin<ResolvedWhatsAppAccount> = {
  ...createWhatsAppPluginBase({
    groups: {
      resolveRequireMention: resolveWhatsAppGroupRequireMention,
      resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
      resolveGroupIntroHint: resolveWhatsAppGroupIntroHint,
    },
    setupWizard: whatsappSetupWizardProxy,
    setup: whatsappSetupAdapter,
    isConfigured: async (account) => await webAuthExists(account.authDir),
    unconfiguredReason: () => "not linked",
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.authDir),
      linked: Boolean(account.authDir),
      dmPolicy: account.dmPolicy,
      allowFrom: account.allowFrom,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => resolveWhatsAppConfigAllowFrom({ cfg, accountId }),
    formatAllowFrom: ({ allowFrom }) => formatWhatsAppConfigAllowFromEntries(allowFrom),
    resolveDefaultTo: ({ cfg, accountId }) => resolveWhatsAppConfigDefaultTo({ cfg, accountId }),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) =>
      buildAccountScopedDmSecurityPolicy({
        cfg,
        channelKey: "whatsapp",
        accountId,
        fallbackAccountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        policy: account.dmPolicy,
        allowFrom: account.allowFrom ?? [],
        policyPathSuffix: "dmPolicy",
        normalizeEntry: (raw) => normalizeE164(raw),
      }),
    collectWarnings: ({ account, cfg }) => {
      const groupAllowlistConfigured =
        Boolean(account.groups) && Object.keys(account.groups ?? {}).length > 0;
      return collectAllowlistProviderGroupPolicyWarnings({
        cfg,
        providerConfigPresent: cfg.channels?.whatsapp !== undefined,
        configuredGroupPolicy: account.groupPolicy,
        collect: (groupPolicy) =>
          collectOpenGroupPolicyRouteAllowlistWarnings({
            groupPolicy,
            routeAllowlistConfigured: groupAllowlistConfigured,
            restrictSenders: {
              surface: "WhatsApp groups",
              openScope: "any member in allowed groups",
              groupPolicyPath: "channels.whatsapp.groupPolicy",
              groupAllowFromPath: "channels.whatsapp.groupAllowFrom",
            },
            noRouteAllowlist: {
              surface: "WhatsApp groups",
              routeAllowlistPath: "channels.whatsapp.groups",
              routeScope: "group",
              groupPolicyPath: "channels.whatsapp.groupPolicy",
              groupAllowFromPath: "channels.whatsapp.groupAllowFrom",
            },
          }),
      });
    },
  },
  setup: whatsappSetupAdapter,
  groups: {
    resolveRequireMention: resolveWhatsAppGroupRequireMention,
    resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
    resolveGroupIntroHint: resolveWhatsAppGroupIntroHint,
  },
};
