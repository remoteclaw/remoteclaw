import { getLoadedChannelPluginForRead } from "../../channels/plugins/registry-loaded-read.js";
import type { ChannelOutboundTargetMode, ChannelPlugin } from "../../channels/plugins/types.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import {
  resolveOutboundTargetWithPlugin,
  type OutboundTargetResolution,
} from "./targets-resolve-shared.js";

function resolveLoadedOutboundChannelPlugin(channel: string): ChannelPlugin | undefined {
  const normalized = normalizeOptionalString(channel);
  if (!normalized) {
    return undefined;
  }

  return getLoadedChannelPluginForRead(normalized);
}

export function tryResolveLoadedOutboundTarget(params: {
  channel: GatewayMessageChannel;
  to?: string;
  allowFrom?: string[];
  cfg?: RemoteClawConfig;
  accountId?: string | null;
  mode?: ChannelOutboundTargetMode;
}): OutboundTargetResolution | undefined {
  return resolveOutboundTargetWithPlugin({
    plugin: resolveLoadedOutboundChannelPlugin(params.channel),
    target: params,
  });
}
