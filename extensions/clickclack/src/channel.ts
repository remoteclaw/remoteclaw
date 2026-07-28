/**
 * ClickClack channel plugin definition: target parsing, account config, status,
 * gateway startup, and outbound delivery wiring.
 */
import {
  buildChannelOutboundSessionRoute,
  buildComputedAccountStatusSnapshot,
  buildThreadAwareOutboundSessionRoute,
  createChatChannelPlugin,
  createDefaultChannelRuntimeState,
  DEFAULT_ACCOUNT_ID,
  type ChannelPlugin,
} from "remoteclaw/plugin-sdk/clickclack";
import {
  listClickClackAccountIds,
  resolveClickClackAccount,
  resolveDefaultClickClackAccountId,
} from "./accounts.js";
import { clickClackConfigSchema } from "./config-schema.js";
import { startClickClackGatewayAccount } from "./gateway.js";
import { sendClickClackText } from "./outbound.js";
import {
  buildClickClackTarget,
  looksLikeClickClackTarget,
  normalizeClickClackTarget,
  parseClickClackTarget,
} from "./target.js";
import type { CoreConfig, ResolvedClickClackAccount } from "./types.js";

const CHANNEL_ID = "clickclack" as const;

// Plugin-provided channels declare their own metadata inline (see
// extensions/mattermost, extensions/matrix). The fork's `getChatChannelMeta`
// is typed to the core `ChatChannelId` union, which covers only built-in
// channels — widening it for a plugin channel is not the fork's convention.
const meta = {
  id: CHANNEL_ID,
  label: "ClickClack",
  selectionLabel: "ClickClack (plugin)",
  detailLabel: "ClickClack Bot",
  docsPath: "/channels/clickclack",
  docsLabel: "clickclack",
  blurb: "self-hosted chat via first-class ClickClack bot tokens.",
  systemImage: "bubble.left.and.bubble.right",
  order: 85,
  quickstartAllowFrom: true,
};

/**
 * Channel plugin instance registered by the bundled ClickClack entry.
 */
export const clickClackPlugin: ChannelPlugin<ResolvedClickClackAccount> = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta,
    capabilities: {
      chatTypes: ["direct", "group"],
      threads: true,
      blockStreaming: true,
    },
    reload: { configPrefixes: ["channels.clickclack"] },
    configSchema: clickClackConfigSchema,
    config: {
      listAccountIds: (cfg) => listClickClackAccountIds(cfg as CoreConfig),
      resolveAccount: (cfg, accountId) =>
        resolveClickClackAccount({ cfg: cfg as CoreConfig, accountId }),
      defaultAccountId: (cfg) => resolveDefaultClickClackAccountId(cfg as CoreConfig),
      isConfigured: (account) => account.configured,
      resolveAllowFrom: ({ cfg, accountId }) =>
        resolveClickClackAccount({ cfg: cfg as CoreConfig, accountId }).allowFrom,
      resolveDefaultTo: ({ cfg, accountId }) =>
        resolveClickClackAccount({ cfg: cfg as CoreConfig, accountId }).defaultTo,
    },
    // Upstream additionally declared `targetPrefixes`, `inferTargetChatType`,
    // and `resolveSessionConversation` here. The fork's `ChannelMessagingAdapter`
    // carries none of them and nothing in this repo reads them, so they are
    // dropped rather than reintroduced as unconsumed surface — the same posture
    // `plugin-sdk/channel-core.ts` documents for the factory carve.
    messaging: {
      normalizeTarget: normalizeClickClackTarget,
      targetResolver: {
        looksLikeId: looksLikeClickClackTarget,
        hint: "<channel:name|dm:usr_id|thread:msg_id>",
      },
      resolveOutboundSessionRoute: ({
        cfg,
        agentId,
        accountId,
        target,
        replyToId,
        threadId,
        currentSessionKey,
      }) => {
        const parsed = parseClickClackTarget(target);
        const baseRoute = buildChannelOutboundSessionRoute({
          cfg,
          agentId,
          channel: CHANNEL_ID,
          accountId,
          peer: {
            kind: parsed.chatType === "direct" ? "direct" : "channel",
            id: buildClickClackTarget(parsed),
          },
          chatType: parsed.chatType,
          from: `clickclack:${accountId ?? DEFAULT_ACCOUNT_ID}`,
          to: buildClickClackTarget(parsed),
        });
        return buildThreadAwareOutboundSessionRoute({
          route: baseRoute,
          replyToId,
          threadId: threadId ?? (parsed.kind === "thread" ? parsed.id : undefined),
          currentSessionKey,
          canRecoverCurrentThread: () => true,
        });
      },
    },
    status: {
      defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
      buildChannelSummary: ({ snapshot }) => ({
        ok: Boolean(snapshot.configured),
        label: snapshot.configured ? "configured" : "missing config",
        detail: snapshot.baseUrl ?? "",
      }),
      buildAccountSnapshot: ({ account, runtime }) => ({
        ...buildComputedAccountStatusSnapshot({
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: account.configured,
          runtime,
        }),
        baseUrl: account.baseUrl,
      }),
    },
    gateway: {
      startAccount: startClickClackGatewayAccount,
    },
  },
  outbound: {
    base: {
      deliveryMode: "direct",
    },
    attachedResults: {
      channel: CHANNEL_ID,
      sendText: async ({ cfg, to, text, accountId, threadId, replyToId }) =>
        await sendClickClackText({
          cfg: cfg as CoreConfig,
          accountId,
          to,
          text,
          threadId,
          replyToId,
        }),
    },
  },
});
