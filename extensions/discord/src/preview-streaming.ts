// Discord plugin module implements preview streaming behavior.
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
  if (params.streaming === undefined && params.streamMode === undefined) {
    return "progress";
  }
  return resolveChannelPreviewStreamMode(params, "off");
}
