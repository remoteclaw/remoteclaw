import { normalizeLowercaseStringOrEmpty } from "remoteclaw/plugin-sdk/text-runtime";
import { resolveConfiguredAcpRoute } from "../../../src/acp/persistent-bindings.route.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import { logVerbose } from "../../../src/globals.js";
import { getSessionBindingService } from "../../../src/infra/outbound/session-binding-service.js";
import {
  buildAgentSessionKey,
  deriveLastRoutePolicy,
  pickFirstExistingAgentId,
  resolveAgentRouteWithPolicy,
  type ResolvedAgentRoute,
} from "../../../src/routing/resolve-route.js";
import {
  buildAgentMainSessionKey,
  resolveAgentIdFromSessionKey,
} from "../../../src/routing/session-key.js";
import {
  buildTelegramGroupPeerId,
  buildTelegramParentPeer,
  resolveTelegramDirectPeerId,
} from "./bot/helpers.js";

export function resolveTelegramConversationRoute(params: {
  cfg: RemoteClawConfig;
  accountId: string;
  chatId: number | string;
  isGroup: boolean;
  resolvedThreadId?: number;
  replyThreadId?: number;
  senderId?: string | number | null;
  topicAgentId?: string | null;
}): {
  route: ResolvedAgentRoute;
  configuredBinding: ReturnType<typeof resolveConfiguredAcpRoute>["configuredBinding"];
  configuredBindingSessionKey: string;
} | null {
  const peerId = params.isGroup
    ? buildTelegramGroupPeerId(params.chatId, params.resolvedThreadId)
    : resolveTelegramDirectPeerId({
        chatId: params.chatId,
        senderId: params.senderId,
      });
  const parentPeer = buildTelegramParentPeer({
    isGroup: params.isGroup,
    resolvedThreadId: params.resolvedThreadId,
    chatId: params.chatId,
  });
  const initialRoute = resolveAgentRouteWithPolicy({
    cfg: params.cfg,
    channel: "telegram",
    accountId: params.accountId,
    peer: {
      kind: params.isGroup ? "group" : "direct",
      id: peerId,
    },
    parentPeer,
  });
  if (!initialRoute) {
    // Silent drop: routing.unmatched policy says no catch-all. Telemetry
    // already fired via handleUnmatched.
    return null;
  }
  let route: ResolvedAgentRoute = initialRoute;

  const rawTopicAgentId = params.topicAgentId?.trim();
  if (rawTopicAgentId) {
    const topicAgentId = pickFirstExistingAgentId(params.cfg, rawTopicAgentId);
    const sessionKey = normalizeLowercaseStringOrEmpty(
      buildAgentSessionKey({
        agentId: topicAgentId,
        channel: "telegram",
        accountId: params.accountId,
        peer: { kind: params.isGroup ? "group" : "direct", id: peerId },
        dmScope: params.cfg.session?.dmScope,
        identityLinks: params.cfg.session?.identityLinks,
      }),
    );
    const mainSessionKey = normalizeLowercaseStringOrEmpty(
      buildAgentMainSessionKey({
        agentId: topicAgentId,
      }),
    );
    route = {
      ...route,
      agentId: topicAgentId,
      sessionKey,
      mainSessionKey,
      lastRoutePolicy: deriveLastRoutePolicy({
        sessionKey,
        mainSessionKey,
      }),
    };
    logVerbose(
      `telegram: topic route override: topic=${params.resolvedThreadId ?? params.replyThreadId} agent=${topicAgentId} sessionKey=${route.sessionKey}`,
    );
  }

  const configuredRoute = resolveConfiguredAcpRoute({
    cfg: params.cfg,
    route,
    channel: "telegram",
    accountId: params.accountId,
    conversationId: peerId,
    parentConversationId: params.isGroup ? String(params.chatId) : undefined,
  });
  let configuredBinding = configuredRoute.configuredBinding;
  let configuredBindingSessionKey = configuredRoute.boundSessionKey ?? "";
  route = configuredRoute.route;

  const threadBindingConversationId =
    params.replyThreadId != null
      ? `${params.chatId}:topic:${params.replyThreadId}`
      : !params.isGroup
        ? String(params.chatId)
        : undefined;
  if (threadBindingConversationId) {
    const threadBinding = getSessionBindingService().resolveByConversation({
      channel: "telegram",
      accountId: params.accountId,
      conversationId: threadBindingConversationId,
    });
    const boundSessionKey = threadBinding?.targetSessionKey?.trim();
    if (threadBinding && boundSessionKey) {
      route = {
        ...route,
        sessionKey: boundSessionKey,
        agentId: resolveAgentIdFromSessionKey(boundSessionKey),
        lastRoutePolicy: deriveLastRoutePolicy({
          sessionKey: boundSessionKey,
          mainSessionKey: route.mainSessionKey,
        }),
        matchedBy: "binding.channel",
      };
      configuredBinding = null;
      configuredBindingSessionKey = "";
      getSessionBindingService().touch(threadBinding.bindingId);
      logVerbose(
        `telegram: routed via bound conversation ${threadBindingConversationId} -> ${boundSessionKey}`,
      );
    }
  }

  return {
    route,
    configuredBinding,
    configuredBindingSessionKey,
  };
}
