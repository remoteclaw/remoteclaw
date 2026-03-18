import { type ResolvedDiscordAccount } from "./accounts.js";
import { type ChannelPlugin } from "./runtime-api.js";
import { discordSetupAdapter } from "./setup-core.js";
import { createDiscordPluginBase } from "./shared.js";

export const discordSetupPlugin: ChannelPlugin<ResolvedDiscordAccount> = {
  id: "discord",
  meta: {
    ...getChatChannelMeta("discord"),
  },
  setupWizard: discordSetupWizard,
  capabilities: {
    chatTypes: ["direct", "channel", "thread"],
    polls: true,
    reactions: true,
    threads: true,
    media: true,
    nativeCommands: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.discord"] },
  configSchema: buildChannelConfigSchema(DiscordConfigSchema),
  config: {
    ...discordConfigBase,
    isConfigured: (account) => Boolean(account.token?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
      tokenSource: account.tokenSource,
    }),
    ...discordConfigAccessors,
  },
  setup: discordSetupAdapter,
};
