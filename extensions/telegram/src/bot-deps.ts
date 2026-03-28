import { loadConfig, resolveStorePath } from "remoteclaw/plugin-sdk/config-runtime";
import { readChannelAllowFromStore } from "remoteclaw/plugin-sdk/conversation-runtime";
import { enqueueSystemEvent } from "remoteclaw/plugin-sdk/infra-runtime";
import {
  dispatchReplyWithBufferedBlockDispatcher,
  listSkillCommandsForAgents,
} from "remoteclaw/plugin-sdk/reply-runtime";
import { wasSentByBot } from "./sent-message-cache.js";

export type TelegramBotDeps = {
  loadConfig: typeof loadConfig;
  resolveStorePath: typeof resolveStorePath;
  readChannelAllowFromStore: typeof readChannelAllowFromStore;
  enqueueSystemEvent: typeof enqueueSystemEvent;
  dispatchReplyWithBufferedBlockDispatcher: typeof dispatchReplyWithBufferedBlockDispatcher;
  listSkillCommandsForAgents: typeof listSkillCommandsForAgents;
  wasSentByBot: typeof wasSentByBot;
};

export const defaultTelegramBotDeps: TelegramBotDeps = {
  loadConfig,
  resolveStorePath,
  readChannelAllowFromStore,
  enqueueSystemEvent,
  dispatchReplyWithBufferedBlockDispatcher,
  listSkillCommandsForAgents,
  wasSentByBot,
};
