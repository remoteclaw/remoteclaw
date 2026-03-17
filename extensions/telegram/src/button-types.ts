import { reduceInteractiveReply } from "remoteclaw/plugin-sdk/channel-runtime";
import {
  normalizeInteractiveReply,
  type InteractiveReply,
  type InteractiveReplyButton,
} from "remoteclaw/plugin-sdk/channel-runtime";

export type TelegramButtonStyle = "danger" | "success" | "primary";

export type TelegramInlineButton = {
  text: string;
  callback_data: string;
  style?: TelegramButtonStyle;
};

export type TelegramInlineButtons = ReadonlyArray<ReadonlyArray<TelegramInlineButton>>;
