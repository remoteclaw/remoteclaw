import {
  resolveChannelPreviewStreamMode,
  type StreamingMode,
} from "remoteclaw/plugin-sdk/channel-streaming";

type DiscordPreviewStreamMode = StreamingMode;

export function resolveDiscordPreviewStreamMode(
  params: {
    streamMode?: unknown;
    streaming?: unknown;
  } = {},
): DiscordPreviewStreamMode {
  return resolveChannelPreviewStreamMode(params, "off");
}
