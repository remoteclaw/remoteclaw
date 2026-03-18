import type {
  ChannelMessagingAdapter,
  ChannelOutboundSessionRoute,
} from "../channels/plugins/types.core.js";
import type { RemoteClawConfig } from "../config/config.js";
import { buildOutboundBaseSessionKey } from "../infra/outbound/base-session-key.js";

export type {
  AnyAgentTool,
  RemoteClawPluginApi,
  RemoteClawPluginService,
  ProviderAuthContext,
  ProviderAuthResult,
} from "../plugins/types.js";
export type {
  ChannelOutboundSessionRoute,
  ChannelMessagingAdapter,
} from "../channels/plugins/types.core.js";
export type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
export type { ChannelMessageActionContext } from "../channels/plugins/types.js";
export type { PluginRuntime } from "../plugins/runtime/types.js";
export type { RemoteClawConfig } from "../config/config.js";
export type { GatewayRequestHandlerOptions } from "../gateway/server-methods/types.js";

export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
export { createPluginRuntimeStore } from "./runtime-store.js";

export {
  approveDevicePairing,
  listDevicePairing,
  rejectDevicePairing,
} from "../infra/device-pairing.js";

export {
  runPluginCommandWithTimeout,
  type PluginCommandRunOptions,
  type PluginCommandRunResult,
} from "./run-command.js";

export { resolveGatewayBindUrl } from "../shared/gateway-bind-url.js";
export type { GatewayBindUrlResult } from "../shared/gateway-bind-url.js";

export { resolveTailnetHostWithRunner } from "../shared/tailscale-status.js";
export type {
  TailscaleStatusCommandResult,
  TailscaleStatusCommandRunner,
} from "../shared/tailscale-status.js";
export {
  buildAgentSessionKey,
  type RoutePeer,
  type RoutePeerKind,
} from "../routing/resolve-route.js";
export { buildOutboundBaseSessionKey } from "../infra/outbound/base-session-key.js";
export { normalizeOutboundThreadId } from "../infra/outbound/thread-id.js";
export { resolveThreadSessionKeys } from "../routing/session-key.js";

export type ChannelOutboundSessionRouteParams = Parameters<
  NonNullable<ChannelMessagingAdapter["resolveOutboundSessionRoute"]>
>[0];

export function stripChannelTargetPrefix(raw: string, ...providers: string[]): string {
  const trimmed = raw.trim();
  for (const provider of providers) {
    const prefix = `${provider.toLowerCase()}:`;
    if (trimmed.toLowerCase().startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
}

export function stripTargetKindPrefix(raw: string): string {
  return raw.replace(/^(user|channel|group|conversation|room|dm):/i, "").trim();
}

export function buildChannelOutboundSessionRoute(params: {
  cfg: RemoteClawConfig;
  agentId: string;
  channel: string;
  accountId?: string | null;
  peer: { kind: "direct" | "group" | "channel"; id: string };
  chatType: "direct" | "group" | "channel";
  from: string;
  to: string;
  threadId?: string | number;
}): ChannelOutboundSessionRoute {
  const baseSessionKey = buildOutboundBaseSessionKey({
    cfg: params.cfg,
    agentId: params.agentId,
    channel: params.channel,
    accountId: params.accountId,
    peer: params.peer,
  });
  return {
    sessionKey: baseSessionKey,
    baseSessionKey,
    peer: params.peer,
    chatType: params.chatType,
    from: params.from,
    to: params.to,
    ...(params.threadId !== undefined ? { threadId: params.threadId } : {}),
  };
}
