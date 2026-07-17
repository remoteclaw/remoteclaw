import { normalizeLowercaseStringOrEmpty } from "remoteclaw/plugin-sdk/text-runtime";
import { resolveConfiguredAcpRoute } from "../../../src/acp/persistent-bindings.route.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import { logVerbose } from "../../../src/globals.js";
import { getSessionBindingService } from "../../../src/infra/outbound/session-binding-service.js";
import {
  DEFAULT_ACCOUNT_ID,
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

/**
 * #2961 scenario C — named-account group isolation (cross-account authorization).
 *
 * A non-default ("named") account is an explicitly configured, distinct bot identity, so
 * per #2961 it "must have an explicit binding to handle group traffic".
 *
 * Upstream keyed this gate on `matchedBy === "default"` — the phantom default-agent tier
 * this fork DELETED (see `src/routing/resolve-route.ts`: sole-agent promotion exists
 * "without reintroducing the phantom 'default' agent fallback"). A verbatim port would be
 * dead code that can never fire, because no fork tier is ever named "default". The
 * fork-native equivalent is the tier CLASS: a route that did not match an explicit
 * `binding.*` tier only landed on this agent via an operator catch-all
 * (`unmatched.catchAll`), sole-agent promotion (`fallback.soleAgent`), or the legacy
 * fail-open (`fallback.legacyRoute`) — none of which is an operator declaring "this named
 * account handles this group".
 *
 * This gate is DISTINCT from the scenario-D drop rather than a restatement of it: D fires
 * when the route resolves to NOTHING (the resolver returned null); C fires when the route
 * resolves perfectly well, but on a non-binding tier. A named-account group message under
 * a configured catch-all is delivered past D and dropped only here.
 *
 * DMs are deliberately not gated — the isolation boundary #2961 names is group traffic.
 *
 * Shared by the inbound message path (`bot-message-context.ts`), the reaction handler
 * (`bot-handlers.ts`, #3001 gap A), and the native-command path (`bot-native-commands.ts`,
 * #3001 gap B) so the isolation posture stays consistent across every group-traffic surface.
 */
export function shouldDropNamedAccountGroupMessage(route: ResolvedAgentRoute): boolean {
  const isNamedAccount = route.accountId !== DEFAULT_ACCOUNT_ID;
  const matchedExplicitBinding = route.matchedBy.startsWith("binding.");
  return isNamedAccount && !matchedExplicitBinding;
}

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
