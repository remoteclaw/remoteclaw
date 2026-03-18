import {
  createLegacyMessageToolDiscoveryMethods,
  createDiscordMessageToolComponentsSchema,
  createUnionActionGate,
  listTokenSourcedAccounts,
} from "remoteclaw/plugin-sdk/channel-actions";
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelMessageToolDiscovery,
} from "remoteclaw/plugin-sdk/channel-contract";
import type { DiscordActionConfig } from "remoteclaw/plugin-sdk/config-runtime";
import { createDiscordActionGate, listEnabledDiscordAccounts } from "./accounts.js";
import { handleDiscordMessageAction } from "./actions/handle-action.js";

function resolveDiscordActionDiscovery(cfg: Parameters<typeof listEnabledDiscordAccounts>[0]) {
  const accounts = listTokenSourcedAccounts(listEnabledDiscordAccounts(cfg));
  if (accounts.length === 0) {
    return null;
  }
  const unionGate = createUnionActionGate(accounts, (account) =>
    createDiscordActionGate({
      cfg,
      accountId: account.accountId,
    }),
  );
  return {
    isEnabled: (key: keyof DiscordActionConfig, defaultValue = true) =>
      unionGate(key, defaultValue),
  };
}

export const discordMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: describeDiscordMessageTool,
  ...createLegacyMessageToolDiscoveryMethods(describeDiscordMessageTool),
  extractToolSend: ({ args }) => {
    const action = typeof args.action === "string" ? args.action.trim() : "";
    if (action === "sendMessage") {
      const to = typeof args.to === "string" ? args.to : undefined;
      return to ? { to } : null;
    }
    if (action === "threadReply") {
      const channelId = typeof args.channelId === "string" ? args.channelId.trim() : "";
      return channelId ? { to: `channel:${channelId}` } : null;
    }
    return null;
  },
  handleAction: async ({
    action,
    params,
    cfg,
    accountId,
    requesterSenderId,
    toolContext,
    mediaLocalRoots,
  }) => {
    return await handleDiscordMessageAction({
      action,
      params,
      cfg,
      accountId,
      requesterSenderId,
      toolContext,
      mediaLocalRoots,
    });
  },
};
