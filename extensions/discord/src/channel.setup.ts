import { type ChannelPlugin } from "remoteclaw/plugin-sdk/discord";
import { type ResolvedDiscordAccount } from "./accounts.js";
import { discordSetupAdapter } from "./setup-core.js";
import { createDiscordPluginBase } from "./shared.js";

export const discordSetupPlugin: ChannelPlugin<ResolvedDiscordAccount> = {
  ...createDiscordPluginBase({
    setup: discordSetupAdapter,
  }),
};
