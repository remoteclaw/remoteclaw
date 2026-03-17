import {
  buildChannelConfigSchema,
  DiscordConfigSchema,
  getChatChannelMeta,
  type ChannelPlugin,
} from "../../../src/plugin-sdk-internal/discord.js";
import { type ResolvedDiscordAccount } from "./accounts.js";
import { discordConfigAccessors, discordConfigBase, discordSetupWizard } from "./plugin-shared.js";
import { discordSetupAdapter } from "./setup-core.js";

export const discordSetupPlugin: ChannelPlugin<ResolvedDiscordAccount> = {
  ...createDiscordPluginBase({
    setup: discordSetupAdapter,
  }),
};
