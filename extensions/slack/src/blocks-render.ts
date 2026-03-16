import type { Block, KnownBlock } from "@slack/web-api";
<<<<<<<< HEAD:extensions/slack/src/shared-interactive.ts
import { truncateSlackText } from "../../../extensions/slack/src/truncate.js";
|||||||| parent of c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/shared-interactive.ts
import type { InteractiveReply } from "../../../src/interactive/payload.js";
import { truncateSlackText } from "./truncate.js";
========
import { reduceInteractiveReply } from "../../../src/channels/plugins/outbound/interactive.js";
import type { InteractiveReply } from "../../../src/interactive/payload.js";
import { truncateSlackText } from "./truncate.js";
>>>>>>>> c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/blocks-render.ts

<<<<<<<< HEAD:extensions/slack/src/shared-interactive.ts
type InteractiveButtonStyle = "primary" | "secondary" | "success" | "danger";

type InteractiveReplyButton = {
  label: string;
  value: string;
  style?: InteractiveButtonStyle;
};

type InteractiveReplyOption = {
  label: string;
  value: string;
};

type InteractiveReplyTextBlock = {
  type: "text";
  text: string;
};

type InteractiveReplyButtonsBlock = {
  type: "buttons";
  buttons: InteractiveReplyButton[];
};

type InteractiveReplySelectBlock = {
  type: "select";
  placeholder?: string;
  options: InteractiveReplyOption[];
};

type InteractiveReplyBlock =
  | InteractiveReplyTextBlock
  | InteractiveReplyButtonsBlock
  | InteractiveReplySelectBlock;

type InteractiveReply = {
  blocks: InteractiveReplyBlock[];
};

const SLACK_REPLY_BUTTON_ACTION_ID = "remoteclaw:reply_button";
const SLACK_REPLY_SELECT_ACTION_ID = "remoteclaw:reply_select";
|||||||| parent of c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/shared-interactive.ts
const SLACK_REPLY_BUTTON_ACTION_ID = "remoteclaw:reply_button";
const SLACK_REPLY_SELECT_ACTION_ID = "remoteclaw:reply_select";
========
export const SLACK_REPLY_BUTTON_ACTION_ID = "remoteclaw:reply_button";
export const SLACK_REPLY_SELECT_ACTION_ID = "remoteclaw:reply_select";
>>>>>>>> c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/blocks-render.ts
const SLACK_SECTION_TEXT_MAX = 3000;
const SLACK_PLAIN_TEXT_MAX = 75;

export type SlackBlock = Block | KnownBlock;

export function buildSlackInteractiveBlocks(interactive?: InteractiveReply): SlackBlock[] {
  const initialState = {
    blocks: [] as SlackBlock[],
    buttonIndex: 0,
    selectIndex: 0,
  };
  return reduceInteractiveReply(interactive, initialState, (state, block) => {
    if (block.type === "text") {
      const trimmed = block.text.trim();
      if (!trimmed) {
        return state;
      }
      state.blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: truncateSlackText(trimmed, SLACK_SECTION_TEXT_MAX),
        },
      });
      return state;
    }
    if (block.type === "buttons") {
      if (block.buttons.length === 0) {
        return state;
      }
      state.blocks.push({
        type: "actions",
<<<<<<<< HEAD:extensions/slack/src/shared-interactive.ts
        block_id: `remoteclaw_reply_buttons_${++buttonIndex}`,
|||||||| parent of c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/shared-interactive.ts
        block_id: `remoteclaw_reply_buttons_${++buttonIndex}`,
========
        block_id: `remoteclaw_reply_buttons_${++state.buttonIndex}`,
>>>>>>>> c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/blocks-render.ts
        elements: block.buttons.map((button, choiceIndex) => ({
          type: "button",
          action_id: SLACK_REPLY_BUTTON_ACTION_ID,
          text: {
            type: "plain_text",
            text: truncateSlackText(button.label, SLACK_PLAIN_TEXT_MAX),
            emoji: true,
          },
          value: button.value,
        })),
      });
      return state;
    }
    if (block.options.length === 0) {
      return state;
    }
    state.blocks.push({
      type: "actions",
<<<<<<<< HEAD:extensions/slack/src/shared-interactive.ts
      block_id: `remoteclaw_reply_select_${++selectIndex}`,
|||||||| parent of c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/shared-interactive.ts
      block_id: `remoteclaw_reply_select_${++selectIndex}`,
========
      block_id: `remoteclaw_reply_select_${++state.selectIndex}`,
>>>>>>>> c7d31bae8a (Channels: centralize shared interactive rendering):extensions/slack/src/blocks-render.ts
      elements: [
        {
          type: "static_select",
          action_id: SLACK_REPLY_SELECT_ACTION_ID,
          placeholder: {
            type: "plain_text",
            text: truncateSlackText(
              block.placeholder?.trim() || "Choose an option",
              SLACK_PLAIN_TEXT_MAX,
            ),
            emoji: true,
          },
          options: block.options.map((option, choiceIndex) => ({
            text: {
              type: "plain_text",
              text: truncateSlackText(option.label, SLACK_PLAIN_TEXT_MAX),
              emoji: true,
            },
            value: option.value,
          })),
        },
      ],
    });
    return state;
  }).blocks;
}
