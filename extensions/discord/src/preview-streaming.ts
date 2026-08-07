// Discord plugin module implements preview streaming behavior.
import {
  resolveChannelPreviewStreamMode,
  type StreamingMode,
} from "remoteclaw/plugin-sdk/channel-streaming";

export function resolveDiscordPreviewStreamMode(
  params: {
    streamMode?: unknown;
    streaming?: unknown;
  } = {},
): StreamingMode {
  if (params.streaming === undefined && params.streamMode === undefined) {
    return "progress";
  }
  return resolveChannelPreviewStreamMode(params, "off");
}
