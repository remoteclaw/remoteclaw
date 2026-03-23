import {
  buildModelsProviderData,
  listSkillCommandsForAgents,
} from "remoteclaw/plugin-sdk/command-auth";
import { loadConfig, resolveStorePath } from "remoteclaw/plugin-sdk/config-runtime";
import { readChannelAllowFromStore } from "remoteclaw/plugin-sdk/conversation-runtime";
import { upsertChannelPairingRequest } from "remoteclaw/plugin-sdk/conversation-runtime";
import { enqueueSystemEvent } from "remoteclaw/plugin-sdk/infra-runtime";
import { dispatchReplyWithBufferedBlockDispatcher } from "remoteclaw/plugin-sdk/reply-runtime";
import { loadWebMedia } from "remoteclaw/plugin-sdk/web-media";
import { wasSentByBot } from "./sent-message-cache.js";

export type TelegramBotDeps = {
  loadConfig: typeof loadConfig;
  resolveStorePath: typeof resolveStorePath;
  readChannelAllowFromStore: typeof readChannelAllowFromStore;
  upsertChannelPairingRequest: typeof upsertChannelPairingRequest;
  enqueueSystemEvent: typeof enqueueSystemEvent;
  dispatchReplyWithBufferedBlockDispatcher: typeof dispatchReplyWithBufferedBlockDispatcher;
  loadWebMedia: typeof loadWebMedia;
  buildModelsProviderData: typeof buildModelsProviderData;
  listSkillCommandsForAgents: typeof listSkillCommandsForAgents;
  wasSentByBot: typeof wasSentByBot;
};

export const defaultTelegramBotDeps: TelegramBotDeps = {
  get loadConfig() {
    return loadConfig;
  },
  get resolveStorePath() {
    return resolveStorePath;
  },
  get readChannelAllowFromStore() {
    return readChannelAllowFromStore;
  },
  get upsertChannelPairingRequest() {
    return upsertChannelPairingRequest;
  },
  get enqueueSystemEvent() {
    return enqueueSystemEvent;
  },
  get dispatchReplyWithBufferedBlockDispatcher() {
    return dispatchReplyWithBufferedBlockDispatcher;
  },
  get loadWebMedia() {
    return loadWebMedia;
  },
  get buildModelsProviderData() {
    return buildModelsProviderData;
  },
  get listSkillCommandsForAgents() {
    return listSkillCommandsForAgents;
  },
  get wasSentByBot() {
    return wasSentByBot;
  },
};
