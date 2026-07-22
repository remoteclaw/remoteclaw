import type { ChannelId } from "../../channels/plugins/types.js";
import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";
import { resolveOutboundChannelPlugin } from "../../infra/outbound/channel-resolution.js";
import {
  resolveOutboundSessionRoute,
  type OutboundSessionRoute,
} from "../../infra/outbound/outbound-session.js";
import {
  resolveChannelTarget,
  type ResolvedMessagingTarget,
} from "../../infra/outbound/target-resolver.js";
export { getLoadedChannelPluginForRead } from "../../channels/plugins/registry-loaded-read.js";
export { mapAllowFromEntries } from "../../plugin-sdk/channel-config-helpers.js";
export { resolveFirstBoundAccountId } from "../../routing/bound-account-read.js";

/** Resolves a cron delivery target through channel plugins with bootstrap allowed. */
export async function resolveChannelTargetForDelivery(params: {
  cfg: RemoteClawConfig;
  channel: ChannelId;
  input: string;
  accountId?: string | null;
}): Promise<{ ok: true; target: ResolvedMessagingTarget } | { ok: false; error: Error }> {
  resolveOutboundChannelPlugin({
    channel: params.channel,
    cfg: params.cfg,
  });
  try {
    return await resolveChannelTarget({
      cfg: params.cfg,
      channel: params.channel,
      input: params.input,
      accountId: params.accountId,
      unknownTargetMode: "normalized",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/** Resolves the outbound session route used for cron delivery threading and mirrors. */
export async function resolveOutboundSessionRouteForDelivery(params: {
  cfg: RemoteClawConfig;
  channel: ChannelId;
  agentId: string;
  accountId?: string | null;
  target: string;
  resolvedTarget?: ResolvedMessagingTarget;
  threadId?: string | number | null;
  currentSessionKey?: string;
}): Promise<OutboundSessionRoute | null> {
  resolveOutboundChannelPlugin({
    channel: params.channel,
    cfg: params.cfg,
  });
  return await resolveOutboundSessionRoute(params);
}

/** Returns whether a channel can canonicalize outbound cron delivery sessions. */
export function channelCanResolveOutboundSessionRoute(params: {
  cfg: RemoteClawConfig;
  channel: ChannelId;
}): boolean {
  return Boolean(
    resolveOutboundChannelPlugin({
      channel: params.channel,
      cfg: params.cfg,
    })?.messaging?.resolveOutboundSessionRoute,
  );
}
