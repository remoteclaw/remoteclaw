import {
  extractSlackToolSend,
  listSlackMessageActions,
  resolveSlackChannelId,
  handleSlackMessageAction,
} from "../../plugin-sdk/slack.js";
import type { ChannelMessageActionAdapter } from "./types.js";

export function createSlackActions(providerId: string): ChannelMessageActionAdapter {
  return {
    listActions: ({ cfg }) => listSlackMessageActions(cfg),
    extractToolSend: ({ args }) => extractSlackToolSend(args),
    handleAction: async (ctx) => {
      return await handleSlackMessageAction({
        providerId,
        ctx,
        normalizeChannelId: resolveSlackChannelId,
        includeReadThreadId: true,
        invoke: async (action, cfg, toolContext) =>
          await handleSlackAction(action, cfg, {
            ...(toolContext as SlackActionContext | undefined),
            mediaLocalRoots: ctx.mediaLocalRoots,
          }),
      });
    },
  };
}
