import type { RemoteClawConfig } from "../../../../src/config/config.js";
import {
  deriveLastRoutePolicy,
  resolveAgentRoute,
  resolveAgentRouteWithPolicy,
  type ResolvedAgentRoute,
  type RoutePeer,
} from "../../../../src/routing/resolve-route.js";
import { resolveAgentIdFromSessionKey } from "../../../../src/routing/session-key.js";

export function buildDiscordRoutePeer(params: {
  isDirectMessage: boolean;
  isGroupDm: boolean;
  directUserId?: string | null;
  conversationId: string;
}): RoutePeer {
  return {
    kind: params.isDirectMessage ? "direct" : params.isGroupDm ? "group" : "channel",
    id: params.isDirectMessage ? params.directUserId?.trim() || params.conversationId : params.conversationId,
  };
}

/**
 * Resolve a Discord conversation route applying the operator `routing.unmatched`
 * policy. Returns `null` when the policy drops the message (silent drop +
 * telemetry) so the preflight handler can halt processing cleanly.
 */
export function resolveDiscordConversationRoute(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
  guildId?: string | null;
  memberRoleIds?: string[];
  peer: RoutePeer;
  parentConversationId?: string | null;
}): ResolvedAgentRoute | null {
  return resolveAgentRouteWithPolicy({
    cfg: params.cfg,
    channel: "discord",
    accountId: params.accountId,
    guildId: params.guildId ?? undefined,
    memberRoleIds: params.memberRoleIds,
    peer: params.peer,
    parentPeer: params.parentConversationId ? { kind: "channel", id: params.parentConversationId } : undefined,
  });
}

/**
 * Resolve a Discord bound conversation route. Used by slash command handlers
 * which must always receive a usable route — callers invoke this synchronously
 * to pick an agent for command execution, and silent-drop is not appropriate
 * UX for user-initiated commands. Uses the backward-compatible
 * {@link resolveAgentRoute} which falls back to the first configured agent
 * when no binding matches and no catch-all is configured.
 */
export function resolveDiscordBoundConversationRoute(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
  guildId?: string | null;
  memberRoleIds?: string[];
  isDirectMessage: boolean;
  isGroupDm: boolean;
  directUserId?: string | null;
  conversationId: string;
  parentConversationId?: string | null;
  boundSessionKey?: string | null;
  configuredRoute?: { route: ResolvedAgentRoute } | null;
  matchedBy?: ResolvedAgentRoute["matchedBy"];
}): ResolvedAgentRoute {
  const route = resolveAgentRoute({
    cfg: params.cfg,
    channel: "discord",
    accountId: params.accountId,
    guildId: params.guildId ?? undefined,
    memberRoleIds: params.memberRoleIds,
    peer: buildDiscordRoutePeer({
      isDirectMessage: params.isDirectMessage,
      isGroupDm: params.isGroupDm,
      directUserId: params.directUserId,
      conversationId: params.conversationId,
    }),
    parentPeer: params.parentConversationId ? { kind: "channel", id: params.parentConversationId } : undefined,
  });
  return resolveDiscordEffectiveRoute({
    route,
    boundSessionKey: params.boundSessionKey,
    configuredRoute: params.configuredRoute,
    matchedBy: params.matchedBy,
  });
}

export function resolveDiscordEffectiveRoute(params: {
  route: ResolvedAgentRoute;
  boundSessionKey?: string | null;
  configuredRoute?: { route: ResolvedAgentRoute } | null;
  matchedBy?: ResolvedAgentRoute["matchedBy"];
}): ResolvedAgentRoute {
  const boundSessionKey = params.boundSessionKey?.trim();
  if (!boundSessionKey) {
    return params.configuredRoute?.route ?? params.route;
  }
  return {
    ...params.route,
    sessionKey: boundSessionKey,
    agentId: resolveAgentIdFromSessionKey(boundSessionKey),
    lastRoutePolicy: deriveLastRoutePolicy({
      sessionKey: boundSessionKey,
      mainSessionKey: params.route.mainSessionKey,
    }),
    ...(params.matchedBy ? { matchedBy: params.matchedBy } : {}),
  };
}
