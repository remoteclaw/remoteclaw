import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ChannelMessageActionContext } from "remoteclaw/plugin-sdk/channel-runtime";
import { normalizeInteractiveReply } from "remoteclaw/plugin-sdk/interactive-runtime";
import { readNumberParam, readStringParam } from "remoteclaw/plugin-sdk/slack-core";
import { parseSlackBlocksInput } from "./blocks-input.js";
import { buildSlackInteractiveBlocks } from "./blocks-render.js";

type HandleSlackMessageAction = typeof import("remoteclaw/plugin-sdk/slack").handleSlackMessageAction;

export async function handleSlackMessageAction(
  ...args: Parameters<HandleSlackMessageAction>
): ReturnType<HandleSlackMessageAction> {
  return await handleSlackMessageActionImpl(...args);
}
