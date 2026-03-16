import {
  readNumberParam,
  readStringArrayParam,
  readStringOrNumberParam,
  readStringParam,
} from "openclaw/plugin-sdk/agent-runtime";
import { readBooleanParam } from "openclaw/plugin-sdk/boolean-param";
import { resolveReactionMessageId } from "openclaw/plugin-sdk/channel-runtime";
import {
  createLegacyMessageToolDiscoveryMethods,
  createMessageToolButtonsSchema,
  createTelegramPollExtraToolSchemas,
  createUnionActionGate,
  listTokenSourcedAccounts,
} from "../../../src/channels/plugins/actions/shared.js";
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
} from "../../../src/channels/plugins/types.js";
import type { TelegramActionConfig } from "../../../src/config/types.telegram.js";
import { normalizeInteractiveReply } from "../../../src/interactive/payload.js";
import { readBooleanParam } from "../../../src/plugin-sdk/boolean-param.js";
import { extractToolSend } from "../../../src/plugin-sdk/tool-send.js";
import { resolveTelegramPollVisibility } from "../../../src/poll-params.js";
import {
  createTelegramActionGate,
  listEnabledTelegramAccounts,
  resolveTelegramPollActionGateState,
} from "./accounts.js";
import { handleTelegramAction } from "./action-runtime.js";
import { resolveTelegramInlineButtons } from "./button-types.js";
import { isTelegramInlineButtonsEnabled } from "./inline-buttons.js";
import { buildTelegramInteractiveButtons } from "./shared-interactive.js";

export const telegramMessageActionRuntime = {
  handleTelegramAction,
};

function readTelegramSendParams(params: Record<string, unknown>) {
  const to = readStringParam(params, "to", { required: true });
  const mediaUrl = readStringParam(params, "media", { trim: false });
  const message = readStringParam(params, "message", { required: !mediaUrl, allowEmpty: true });
  const caption = readStringParam(params, "caption", { allowEmpty: true });
  const content = message || caption || "";
  const replyTo = readStringParam(params, "replyTo");
  const threadId = readStringParam(params, "threadId");
  const buttons =
    params.buttons ??
    buildTelegramInteractiveButtons(normalizeInteractiveReply(params.interactive));
  const asVoice = readBooleanParam(params, "asVoice");
  const silent = readBooleanParam(params, "silent");
  const forceDocument = readBooleanParam(params, "forceDocument");
  const quoteText = readStringParam(params, "quoteText");
  return {
    isEnabled: (key: keyof TelegramActionConfig, defaultValue = true) =>
      unionGate(key, defaultValue),
    pollEnabled,
    buttonsEnabled,
  };
}

function describeTelegramMessageTool({
  cfg,
}: Parameters<
  NonNullable<ChannelMessageActionAdapter["describeMessageTool"]>
>[0]): ChannelMessageToolDiscovery {
  const discovery = resolveTelegramActionDiscovery(cfg);
  if (!discovery) {
    return {
      actions: [],
      capabilities: [],
      schema: null,
    };
  }
  const actions = new Set<ChannelMessageActionName>(["send"]);
  if (discovery.pollEnabled) {
    actions.add("poll");
  }
  if (discovery.isEnabled("reactions")) {
    actions.add("react");
  }
  if (discovery.isEnabled("deleteMessage")) {
    actions.add("delete");
  }
  if (discovery.isEnabled("editMessage")) {
    actions.add("edit");
  }
  if (discovery.isEnabled("sticker", false)) {
    actions.add("sticker");
    actions.add("sticker-search");
  }
  if (discovery.isEnabled("createForumTopic")) {
    actions.add("topic-create");
  }
  if (discovery.isEnabled("editForumTopic")) {
    actions.add("topic-edit");
  }
  const schema: ChannelMessageToolSchemaContribution[] = [];
  if (discovery.buttonsEnabled) {
    schema.push({
      properties: {
        buttons: Type.Optional(createMessageToolButtonsSchema()),
      },
    });
  }
  if (discovery.pollEnabled) {
    schema.push({
      properties: createTelegramPollExtraToolSchemas(),
      visibility: "all-configured",
    });
  }
  return {
    actions: Array.from(actions),
    capabilities: discovery.buttonsEnabled ? ["interactive", "buttons"] : [],
    schema,
  };
}

export const telegramMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    const accounts = listTokenSourcedAccounts(listEnabledTelegramAccounts(cfg));
    if (accounts.length === 0) {
      return [];
    }
    // Union of all accounts' action gates (any account enabling an action makes it available)
    const gate = createUnionActionGate(accounts, (account) =>
      createTelegramActionGate({
        cfg,
        accountId: account.accountId,
      }),
    );
    const isEnabled = (key: keyof TelegramActionConfig, defaultValue = true) =>
      gate(key, defaultValue);
    const actions = new Set<ChannelMessageActionName>(["send"]);
    const pollEnabledForAnyAccount = accounts.some((account) => {
      const accountGate = createTelegramActionGate({
        cfg,
        accountId: account.accountId,
      });
      return resolveTelegramPollActionGateState(accountGate).enabled;
    });
    if (pollEnabledForAnyAccount) {
      actions.add("poll");
    }
    if (isEnabled("reactions")) {
      actions.add("react");
    }
    if (isEnabled("deleteMessage")) {
      actions.add("delete");
    }
    if (isEnabled("editMessage")) {
      actions.add("edit");
    }
    if (isEnabled("sticker", false)) {
      actions.add("sticker");
      actions.add("sticker-search");
    }
    if (isEnabled("createForumTopic")) {
      actions.add("topic-create");
    }
    if (isEnabled("editForumTopic")) {
      actions.add("topic-edit");
    }
    return Array.from(actions);
  },
  supportsInteractive: ({ cfg }) => {
    const accounts = listTokenSourcedAccounts(listEnabledTelegramAccounts(cfg));
    if (accounts.length === 0) {
      return false;
    }
    return accounts.some((account) =>
      isTelegramInlineButtonsEnabled({ cfg, accountId: account.accountId }),
    );
  },
  supportsButtons: ({ cfg }) => {
    const accounts = listTokenSourcedAccounts(listEnabledTelegramAccounts(cfg));
    if (accounts.length === 0) {
      return false;
    }
    return accounts.some((account) =>
      isTelegramInlineButtonsEnabled({ cfg, accountId: account.accountId }),
    );
  },
  extractToolSend: ({ args }) => {
    return extractToolSend(args, "sendMessage");
  },
  handleAction: async ({ action, params, cfg, accountId, mediaLocalRoots, toolContext }) => {
    const telegramAction = resolveTelegramMessageActionName(action);
    if (!telegramAction) {
      throw new Error(`Unsupported Telegram action: ${action}`);
    }
    return await telegramMessageActionRuntime.handleTelegramAction(
      {
        ...params,
        action: telegramAction,
        accountId: accountId ?? undefined,
        ...(action === "react"
          ? {
              messageId: resolveReactionMessageId({ args: params, toolContext }),
            }
          : {}),
      },
      cfg,
      { mediaLocalRoots },
    );
  },
};
