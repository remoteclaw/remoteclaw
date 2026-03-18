import { reduceInteractiveReply } from "openclaw/plugin-sdk/interactive-runtime";
import {
  normalizeInteractiveReply,
  type InteractiveReply,
  type InteractiveReplyButton,
} from "openclaw/plugin-sdk/interactive-runtime";

export type TelegramButtonStyle = "danger" | "success" | "primary";

export type TelegramInlineButton = {
  text: string;
  callback_data: string;
  style?: TelegramButtonStyle;
};

export type TelegramInlineButtons = ReadonlyArray<ReadonlyArray<TelegramInlineButton>>;
