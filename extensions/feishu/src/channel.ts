import { describeAccountSnapshot } from "remoteclaw/plugin-sdk/account-helpers";
import { formatAllowFromLowercase } from "remoteclaw/plugin-sdk/allow-from";
import { createMessageToolCardSchema } from "remoteclaw/plugin-sdk/channel-actions";
import {
  collectAllowlistProviderRestrictSendersWarnings,
  formatAllowFromLowercase,
  mapAllowFromEntries,
} from "remoteclaw/plugin-sdk/compat";
import type { ChannelMeta, ChannelPlugin, ClawdbotConfig } from "remoteclaw/plugin-sdk/feishu";
import {
  buildProbeChannelStatusSummary,
  buildRuntimeAccountStatusSnapshot,
  createDefaultChannelRuntimeState,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
} from "remoteclaw/plugin-sdk/feishu";
import {
  resolveFeishuAccount,
  resolveFeishuCredentials,
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
} from "./accounts.js";
import {
  listFeishuDirectoryPeers,
  listFeishuDirectoryGroups,
  listFeishuDirectoryPeersLive,
  listFeishuDirectoryGroupsLive,
} from "./directory.js";
import { feishuOutbound } from "./outbound.js";
import { resolveFeishuGroupToolPolicy } from "./policy.js";
import { probeFeishu } from "./probe.js";
import { sendMessageFeishu } from "./send.js";
import { feishuOnboardingAdapter } from "./setup-surface.js";
import { normalizeFeishuTarget, looksLikeFeishuId, formatFeishuTarget } from "./targets.js";
import type { ResolvedFeishuAccount, FeishuConfig } from "./types.js";

const meta: ChannelMeta = {
  id: "feishu",
  label: "Feishu",
  selectionLabel: "Feishu/Lark (飞书)",
  docsPath: "/channels/feishu",
  docsLabel: "feishu",
  blurb: "飞书/Lark enterprise messaging.",
  aliases: ["lark"],
  order: 70,
};

const secretInputJsonSchema = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      required: ["source", "provider", "id"],
      properties: {
        source: { type: "string", enum: ["env", "file", "exec"] },
        provider: { type: "string", minLength: 1 },
        id: { type: "string", minLength: 1 },
      },
    },
  ],
} as const;

function setFeishuNamedAccountEnabled(
  cfg: ClawdbotConfig,
  accountId: string,
  enabled: boolean,
): ClawdbotConfig {
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...feishuCfg,
        accounts: {
          ...feishuCfg?.accounts,
          [accountId]: {
            ...feishuCfg?.accounts?.[accountId],
            enabled,
          },
        },
      },
    },
  };
}

export const feishuPlugin: ChannelPlugin<ResolvedFeishuAccount> = {
  id: "feishu",
  meta: {
    ...meta,
  },
  pairing: {
    idLabel: "feishuUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(feishu|user|open_id):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      await sendMessageFeishu({
        cfg,
        to: id,
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    threads: true,
    media: true,
    reactions: true,
    edit: true,
    reply: true,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- Feishu targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:open_id` or `chat:chat_id`.",
      "- Feishu supports interactive cards for rich messages.",
    ],
  },
  groups: {
    resolveToolPolicy: resolveFeishuGroupToolPolicy,
  },
  mentions: {
    stripPatterns: () => ['<at user_id="[^"]*">[^<]*</at>'],
  },
  reload: { configPrefixes: ["channels.feishu"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        defaultAccount: { type: "string" },
        appId: { type: "string" },
        appSecret: secretInputJsonSchema,
        encryptKey: secretInputJsonSchema,
        verificationToken: secretInputJsonSchema,
        domain: {
          oneOf: [
            { type: "string", enum: ["feishu", "lark"] },
            { type: "string", format: "uri", pattern: "^https://" },
          ],
        },
        connectionMode: { type: "string", enum: ["websocket", "webhook"] },
        webhookPath: { type: "string" },
        webhookHost: { type: "string" },
        webhookPort: { type: "integer", minimum: 1 },
        dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
        allowFrom: { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } },
        groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
        groupAllowFrom: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }] },
        },
        requireMention: { type: "boolean" },
        groupSessionScope: {
          type: "string",
          enum: ["group", "group_sender", "group_topic", "group_topic_sender"],
        },
        topicSessionMode: { type: "string", enum: ["disabled", "enabled"] },
        replyInThread: { type: "string", enum: ["disabled", "enabled"] },
        historyLimit: { type: "integer", minimum: 0 },
        dmHistoryLimit: { type: "integer", minimum: 0 },
        textChunkLimit: { type: "integer", minimum: 1 },
        chunkMode: { type: "string", enum: ["length", "newline"] },
        mediaMaxMb: { type: "number", minimum: 0 },
        renderMode: { type: "string", enum: ["auto", "raw", "card"] },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              name: { type: "string" },
              appId: { type: "string" },
              appSecret: secretInputJsonSchema,
              encryptKey: secretInputJsonSchema,
              verificationToken: secretInputJsonSchema,
              domain: { type: "string", enum: ["feishu", "lark"] },
              connectionMode: { type: "string", enum: ["websocket", "webhook"] },
              webhookHost: { type: "string" },
              webhookPath: { type: "string" },
              webhookPort: { type: "integer", minimum: 1 },
            },
          },
        },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listFeishuAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveFeishuAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultFeishuAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const account = resolveFeishuAccount({ cfg, accountId });
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        // For default account, set top-level enabled
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            feishu: {
              ...cfg.channels?.feishu,
              enabled,
            },
          },
        };
      }

      // For named accounts, set enabled in accounts[accountId]
      return setFeishuNamedAccountEnabled(cfg, accountId, enabled);
    },
    deleteAccount: ({ cfg, accountId }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        // Delete entire feishu config
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).feishu;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }

      // Delete specific account from accounts
      const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
      const accounts = { ...feishuCfg?.accounts };
      delete accounts[accountId];

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          feishu: {
            ...feishuCfg,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appId: account.appId,
      domain: account.domain,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveFeishuAccount({ cfg, accountId });
      return mapAllowFromEntries(account.config?.allowFrom);

    describeAccount: (account) =>
      describeAccountSnapshot({
        account,
        configured: account.configured,
        extra: {
          appId: account.appId,
          domain: account.domain,
        },
      }),
  },
  actions: {
    describeMessageTool: describeFeishuMessageTool,
    handleAction: async (ctx) => {
      const account = resolveFeishuAccount({ cfg: ctx.cfg, accountId: ctx.accountId ?? undefined });
      if (
        (ctx.action === "react" || ctx.action === "reactions") &&
        !isFeishuReactionsActionEnabled({ cfg: ctx.cfg, account })
      ) {
        throw new Error("Feishu reactions are disabled via actions.reactions.");
      }
      if (ctx.action === "send" || ctx.action === "thread-reply") {
        const to = resolveFeishuActionTarget(ctx);
        if (!to) {
          throw new Error(`Feishu ${ctx.action} requires a target (to).`);
        }
        const replyToMessageId =
          ctx.action === "thread-reply" ? resolveFeishuMessageId(ctx.params) : undefined;
        if (ctx.action === "thread-reply" && !replyToMessageId) {
          throw new Error("Feishu thread-reply requires messageId.");
        }
        const card =
          ctx.params.card && typeof ctx.params.card === "object"
            ? (ctx.params.card as Record<string, unknown>)
            : undefined;
        const text = readFirstString(ctx.params, ["text", "message"]);
        if (!card && !text) {
          throw new Error(`Feishu ${ctx.action} requires text/message or card.`);
        }
        const runtime = await loadFeishuChannelRuntime();
        const result = card
          ? await runtime.sendCardFeishu({
              cfg: ctx.cfg,
              to,
              card,
              accountId: ctx.accountId ?? undefined,
              replyToMessageId,
              replyInThread: ctx.action === "thread-reply",
            })
          : await runtime.sendMessageFeishu({
              cfg: ctx.cfg,
              to,
              text: text!,
              accountId: ctx.accountId ?? undefined,
              replyToMessageId,
              replyInThread: ctx.action === "thread-reply",
            });
        return jsonActionResult({
          ok: true,
          channel: "feishu",
          action: ctx.action,
          ...result,
        });
      }

      if (ctx.action === "read") {
        const messageId = resolveFeishuMessageId(ctx.params);
        if (!messageId) {
          throw new Error("Feishu read requires messageId.");
        }
        const { getMessageFeishu } = await loadFeishuChannelRuntime();
        const message = await getMessageFeishu({
          cfg: ctx.cfg,
          messageId,
          accountId: ctx.accountId ?? undefined,
        });
        if (!message) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Feishu read failed or message not found: ${messageId}`,
                }),
              },
            ],
            details: { error: `Feishu read failed or message not found: ${messageId}` },
          };
        }
        return jsonActionResult({ ok: true, channel: "feishu", action: "read", message });
      }

      if (ctx.action === "edit") {
        const messageId = resolveFeishuMessageId(ctx.params);
        if (!messageId) {
          throw new Error("Feishu edit requires messageId.");
        }
        const text = readFirstString(ctx.params, ["text", "message"]);
        const card =
          ctx.params.card && typeof ctx.params.card === "object"
            ? (ctx.params.card as Record<string, unknown>)
            : undefined;
        const { editMessageFeishu } = await loadFeishuChannelRuntime();
        const result = await editMessageFeishu({
          cfg: ctx.cfg,
          messageId,
          text,
          card,
          accountId: ctx.accountId ?? undefined,
        });
        return jsonActionResult({
          ok: true,
          channel: "feishu",
          action: "edit",
          ...result,
        });
      }

      if (ctx.action === "pin") {
        const messageId = resolveFeishuMessageId(ctx.params);
        if (!messageId) {
          throw new Error("Feishu pin requires messageId.");
        }
        const { createPinFeishu } = await loadFeishuChannelRuntime();
        const pin = await createPinFeishu({
          cfg: ctx.cfg,
          messageId,
          accountId: ctx.accountId ?? undefined,
        });
        return jsonActionResult({ ok: true, channel: "feishu", action: "pin", pin });
      }

      if (ctx.action === "unpin") {
        const messageId = resolveFeishuMessageId(ctx.params);
        if (!messageId) {
          throw new Error("Feishu unpin requires messageId.");
        }
        const { removePinFeishu } = await loadFeishuChannelRuntime();
        await removePinFeishu({
          cfg: ctx.cfg,
          messageId,
          accountId: ctx.accountId ?? undefined,
        });
        return jsonActionResult({
          ok: true,
          channel: "feishu",
          action: "unpin",
          messageId,
        });
      }

      if (ctx.action === "list-pins") {
        const chatId = resolveFeishuChatId(ctx);
        if (!chatId) {
          throw new Error("Feishu list-pins requires chatId or channelId.");
        }
        const { listPinsFeishu } = await loadFeishuChannelRuntime();
        const result = await listPinsFeishu({
          cfg: ctx.cfg,
          chatId,
          startTime: readFirstString(ctx.params, ["startTime", "start_time"]),
          endTime: readFirstString(ctx.params, ["endTime", "end_time"]),
          pageSize: readOptionalNumber(ctx.params, ["pageSize", "page_size"]),
          pageToken: readFirstString(ctx.params, ["pageToken", "page_token"]),
          accountId: ctx.accountId ?? undefined,
        });
        return jsonActionResult({
          ok: true,
          channel: "feishu",
          action: "list-pins",
          ...result,
        });
      }

      if (ctx.action === "channel-info") {
        const chatId = resolveFeishuChatId(ctx);
        if (!chatId) {
          throw new Error("Feishu channel-info requires chatId or channelId.");
        }
        const runtime = await loadFeishuChannelRuntime();
        const client = createFeishuClient(account);
        const channel = await runtime.getChatInfo(client, chatId);
        const includeMembers = ctx.params.includeMembers === true || ctx.params.members === true;
        if (!includeMembers) {
          return jsonActionResult({
            ok: true,
            provider: "feishu",
            action: "channel-info",
            channel,
          });
        }
        const members = await runtime.getChatMembers(
          client,
          chatId,
          readOptionalNumber(ctx.params, ["pageSize", "page_size"]),
          readFirstString(ctx.params, ["pageToken", "page_token"]),
          resolveFeishuMemberIdType(ctx.params),
        );
        return jsonActionResult({
          ok: true,
          provider: "feishu",
          action: "channel-info",
          channel,
          members,
        });
      }

      if (ctx.action === "member-info") {
        const runtime = await loadFeishuChannelRuntime();
        const client = createFeishuClient(account);
        const memberId = resolveFeishuMemberId(ctx.params);
        if (memberId) {
          const member = await runtime.getFeishuMemberInfo(
            client,
            memberId,
            resolveFeishuMemberIdType(ctx.params),
          );
          return jsonActionResult({
            ok: true,
            channel: "feishu",
            action: "member-info",
            member,
          });
        }
        const chatId = resolveFeishuChatId(ctx);
        if (!chatId) {
          throw new Error("Feishu member-info requires memberId or chatId/channelId.");
        }
        const members = await runtime.getChatMembers(
          client,
          chatId,
          readOptionalNumber(ctx.params, ["pageSize", "page_size"]),
          readFirstString(ctx.params, ["pageToken", "page_token"]),
          resolveFeishuMemberIdType(ctx.params),
        );
        return jsonActionResult({
          ok: true,
          channel: "feishu",
          action: "member-info",
          ...members,
        });
      }

      if (ctx.action === "channel-list") {
        const runtime = await loadFeishuChannelRuntime();
        const query = readFirstString(ctx.params, ["query"]);
        const limit = readOptionalNumber(ctx.params, ["limit"]);
        const scope = readFirstString(ctx.params, ["scope", "kind"]) ?? "all";
        if (
          scope === "groups" ||
          scope === "group" ||
          scope === "channels" ||
          scope === "channel"
        ) {
          const groups = await runtime.listFeishuDirectoryGroupsLive({
            cfg: ctx.cfg,
            query,
            limit,
            fallbackToStatic: false,
            accountId: ctx.accountId ?? undefined,
          });
          return jsonActionResult({
            ok: true,
            channel: "feishu",
            action: "channel-list",
            groups,
          });
        }
        if (
          scope === "peers" ||
          scope === "peer" ||
          scope === "members" ||
          scope === "member" ||
          scope === "users" ||
          scope === "user"
        ) {
          const peers = await runtime.listFeishuDirectoryPeersLive({
            cfg: ctx.cfg,
            query,
            limit,
            fallbackToStatic: false,
            accountId: ctx.accountId ?? undefined,
          });
          return jsonActionResult({
            ok: true,
            channel: "feishu",
            action: "channel-list",
            peers,
          });
        }
        const [groups, peers] = await Promise.all([
          runtime.listFeishuDirectoryGroupsLive({
            cfg: ctx.cfg,
            query,
            limit,
            fallbackToStatic: false,
            accountId: ctx.accountId ?? undefined,
          }),
          runtime.listFeishuDirectoryPeersLive({
            cfg: ctx.cfg,
            query,
            limit,
            fallbackToStatic: false,
            accountId: ctx.accountId ?? undefined,
          }),
        ]);
        return jsonActionResult({
          ok: true,
          channel: "feishu",
          action: "channel-list",
          groups,
          peers,
        });
      }

      if (ctx.action === "react") {
        const messageId = resolveFeishuMessageId(ctx.params);
        if (!messageId) {
          throw new Error("Feishu reaction requires messageId.");
        }
        const emoji = typeof ctx.params.emoji === "string" ? ctx.params.emoji.trim() : "";
        const remove = ctx.params.remove === true;
        const clearAll = ctx.params.clearAll === true;
        if (remove) {
          if (!emoji) {
            throw new Error("Emoji is required to remove a Feishu reaction.");
          }
          const { listReactionsFeishu, removeReactionFeishu } = await loadFeishuChannelRuntime();
          const matches = await listReactionsFeishu({
            cfg: ctx.cfg,
            messageId,
            emojiType: emoji,
            accountId: ctx.accountId ?? undefined,
          });
          const ownReaction = matches.find((entry) => entry.operatorType === "app");
          if (!ownReaction) {
            return jsonActionResult({ ok: true, removed: null });
          }
          await removeReactionFeishu({
            cfg: ctx.cfg,
            messageId,
            reactionId: ownReaction.reactionId,
            accountId: ctx.accountId ?? undefined,
          });
          return jsonActionResult({ ok: true, removed: emoji });
        }
        if (!emoji) {
          if (!clearAll) {
            throw new Error(
              "Emoji is required to add a Feishu reaction. Set clearAll=true to remove all bot reactions.",
            );
          }
          const { listReactionsFeishu, removeReactionFeishu } = await loadFeishuChannelRuntime();
          const reactions = await listReactionsFeishu({
            cfg: ctx.cfg,
            messageId,
            accountId: ctx.accountId ?? undefined,
          });
          let removed = 0;
          for (const reaction of reactions.filter((entry) => entry.operatorType === "app")) {
            await removeReactionFeishu({
              cfg: ctx.cfg,
              messageId,
              reactionId: reaction.reactionId,
              accountId: ctx.accountId ?? undefined,
            });
            removed += 1;
          }
          return jsonActionResult({ ok: true, removed });
        }
        const { addReactionFeishu } = await loadFeishuChannelRuntime();
        await addReactionFeishu({
          cfg: ctx.cfg,
          messageId,
          emojiType: emoji,
          accountId: ctx.accountId ?? undefined,
        });
        return jsonActionResult({ ok: true, added: emoji });
      }

      if (ctx.action === "reactions") {
        const messageId = resolveFeishuMessageId(ctx.params);
        if (!messageId) {
          throw new Error("Feishu reactions lookup requires messageId.");
        }
        const { listReactionsFeishu } = await loadFeishuChannelRuntime();
        const reactions = await listReactionsFeishu({
          cfg: ctx.cfg,
          messageId,
          accountId: ctx.accountId ?? undefined,
        });
        return jsonActionResult({ ok: true, reactions });
      }

      throw new Error(`Unsupported Feishu action: "${String(ctx.action)}"`);
    },
    formatAllowFrom: ({ allowFrom }) => formatAllowFromLowercase({ allowFrom }),
  },
  security: {
    collectWarnings: ({ cfg, accountId }) => {
      const account = resolveFeishuAccount({ cfg, accountId });
      const feishuCfg = account.config;
      return collectAllowlistProviderRestrictSendersWarnings({
        cfg,
        providerConfigPresent: cfg.channels?.feishu !== undefined,
        configuredGroupPolicy: feishuCfg?.groupPolicy,
        surface: `Feishu[${account.accountId}] groups`,
        openScope: "any member",
        groupPolicyPath: "channels.feishu.groupPolicy",
        groupAllowFromPath: "channels.feishu.groupAllowFrom",
      });
    },
  },
  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg, accountId }) => {
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            feishu: {
              ...cfg.channels?.feishu,
              enabled: true,
            },
          },
        };
      }

      return setFeishuNamedAccountEnabled(cfg, accountId, true);
    },
  },
  onboarding: feishuOnboardingAdapter,
  messaging: {
    normalizeTarget: (raw) => normalizeFeishuTarget(raw) ?? undefined,
    targetResolver: {
      looksLikeId: looksLikeFeishuId,
      hint: "<chatId|user:openId|chat:chatId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, query, limit, accountId }) =>
      listFeishuDirectoryPeers({
        cfg,
        query: query ?? undefined,
        limit: limit ?? undefined,
        accountId: accountId ?? undefined,
      }),
    listGroups: async ({ cfg, query, limit, accountId }) =>
      listFeishuDirectoryGroups({
        cfg,
        query: query ?? undefined,
        limit: limit ?? undefined,
        accountId: accountId ?? undefined,
      }),
    listPeersLive: async ({ cfg, query, limit, accountId }) =>
      listFeishuDirectoryPeersLive({
        cfg,
        query: query ?? undefined,
        limit: limit ?? undefined,
        accountId: accountId ?? undefined,
      }),
    listGroupsLive: async ({ cfg, query, limit, accountId }) =>
      listFeishuDirectoryGroupsLive({
        cfg,
        query: query ?? undefined,
        limit: limit ?? undefined,
        accountId: accountId ?? undefined,
      }),
  },
  outbound: feishuOutbound,
  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, { port: null }),
    buildChannelSummary: ({ snapshot }) =>
      buildProbeChannelStatusSummary(snapshot, {
        port: snapshot.port ?? null,
      }),
    probeAccount: async ({ account }) => await probeFeishu(account),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appId: account.appId,
      domain: account.domain,
      ...buildRuntimeAccountStatusSnapshot({ runtime, probe }),
      port: runtime?.port ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorFeishuProvider } = await import("./monitor.js");
      const account = resolveFeishuAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
      const port = account.config?.webhookPort ?? null;
      ctx.setStatus({ accountId: ctx.accountId, port });
      ctx.log?.info(
        `starting feishu[${ctx.accountId}] (mode: ${account.config?.connectionMode ?? "websocket"})`,
      );
      return monitorFeishuProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
      });
    },
  },
};
