import { handleSlackMessageAction as handleSlackMessageActionImpl } from "remoteclaw/plugin-sdk/slack";

type HandleSlackMessageAction = typeof import("remoteclaw/plugin-sdk/slack").handleSlackMessageAction;

export async function handleSlackMessageAction(
  ...args: Parameters<HandleSlackMessageAction>
): ReturnType<HandleSlackMessageAction> {
  return await handleSlackMessageActionImpl(...args);
}
