import type {
  TelegramInlineButton,
  TelegramInlineButtons,
} from "../../../extensions/telegram/src/button-types.js";

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

const TELEGRAM_INTERACTIVE_ROW_SIZE = 3;

function toTelegramButtonStyle(
  style?: InteractiveReplyButton["style"],
): TelegramInlineButton["style"] {
  return style === "danger" || style === "success" || style === "primary" ? style : undefined;
}

function chunkInteractiveButtons(
  buttons: readonly InteractiveReplyButton[],
  rows: TelegramInlineButton[][],
) {
  for (let i = 0; i < buttons.length; i += TELEGRAM_INTERACTIVE_ROW_SIZE) {
    const row = buttons.slice(i, i + TELEGRAM_INTERACTIVE_ROW_SIZE).map((button) => ({
      text: button.label,
      callback_data: button.value,
      style: toTelegramButtonStyle(button.style),
    }));
    if (row.length > 0) {
      rows.push(row);
    }
  }
}

export function buildTelegramInteractiveButtons(
  interactive?: InteractiveReply,
): TelegramInlineButtons | undefined {
  const rows: TelegramInlineButton[][] = [];
  for (const block of interactive?.blocks ?? []) {
    if (block.type === "buttons") {
      chunkInteractiveButtons(block.buttons, rows);
      continue;
    }
    if (block.type === "select") {
      chunkInteractiveButtons(
        block.options.map((option) => ({
          label: option.label,
          value: option.value,
        })),
        rows,
      );
    }
  }
  return rows.length > 0 ? rows : undefined;
}
