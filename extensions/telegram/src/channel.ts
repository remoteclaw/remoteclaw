import {
  buildDmGroupAccountAllowlistAdapter,
  createNestedAllowlistOverrideResolver,
} from "remoteclaw/plugin-sdk/allowlist-config-edit";
import { createScopedDmSecurityResolver } from "remoteclaw/plugin-sdk/channel-config-helpers";
import { createAllowlistProviderRouteAllowlistWarningCollector } from "remoteclaw/plugin-sdk/channel-policy";
import {
  attachChannelToResult,
  createAttachedChannelResultAdapter,
  createChannelDirectoryAdapter,
  createPairingPrefixStripper,
  createTopLevelChannelReplyToModeResolver,
  createTextPairingAdapter,
  normalizeMessageChannel,
  normalizeOutboundThreadId,
  resolveThreadSessionKeys,
  type RoutePeer,
} from "remoteclaw/plugin-sdk/routing";
import { createDefaultChannelRuntimeState } from "remoteclaw/plugin-sdk/status-helpers";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  buildTokenChannelStatusSummary,
  clearAccountEntryFields,
  collectTelegramStatusIssues,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatAllowFromLowercase,
  getChatChannelMeta,
  listTelegramAccountIds,
  listTelegramDirectoryGroupsFromConfig,
  listTelegramDirectoryPeersFromConfig,
  looksLikeTelegramTargetId,
  mapAllowFromEntries,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  normalizeTelegramMessagingTarget,
  PAIRING_APPROVED_MESSAGE,
  parseTelegramReplyToMessageId,
  parseTelegramThreadId,
  resolveDefaultTelegramAccountId,
  resolveOptionalConfigString,
  resolveTelegramAccount,
  resolveTelegramGroupRequireMention,
  resolveTelegramGroupToolPolicy,
  setAccountEnabledInConfigSection,
  telegramOnboardingAdapter,
  TelegramConfigSchema,
  type ChannelMessageActionAdapter,
  type ChannelPlugin,
  type RemoteClawConfig,
  type ResolvedTelegramAccount,
  type TelegramProbe,
} from "remoteclaw/plugin-sdk/telegram";
import { parseTelegramTopicConversation } from "../runtime-api.js";
import { getTelegramRuntime } from "./runtime.js";
import { sendTypingTelegram } from "./send.js";
import { telegramSetupAdapter } from "./setup-core.js";
import { telegramSetupWizard } from "./setup-surface.js";
import {
  createTelegramPluginBase,
  findTelegramTokenOwnerAccountId,
  formatDuplicateTelegramTokenReason,
  telegramConfigAdapter,
} from "./shared.js";
import { collectTelegramStatusIssues } from "./status-issues.js";
import { parseTelegramTarget } from "./targets.js";

type TelegramSendFn = ReturnType<
  typeof getTelegramRuntime
>["channel"]["telegram"]["sendMessageTelegram"];

const meta = getChatChannelMeta("telegram");

function findTelegramTokenOwnerAccountId(params: {
  cfg: RemoteClawConfig;
  accountId: string;
}): string | null {
  const normalizedAccountId = normalizeAccountId(params.accountId);
  const tokenOwners = new Map<string, string>();
  for (const id of listTelegramAccountIds(params.cfg)) {
    const account = resolveTelegramAccount({ cfg: params.cfg, accountId: id });
    const token = (account.token ?? "").trim();
    if (!token) {
      continue;
    }
    const ownerAccountId = tokenOwners.get(token);
    if (!ownerAccountId) {
      tokenOwners.set(token, account.accountId);
      continue;
    }
    if (account.accountId === normalizedAccountId) {
      return ownerAccountId;
    }
  }
  return null;
}

function formatDuplicateTelegramTokenReason(params: {
  accountId: string;
  ownerAccountId: string;
}): string {
  return (
    `Duplicate Telegram bot token: account "${params.accountId}" shares a token with ` +
    `account "${params.ownerAccountId}". Keep one owner account per bot token.`
  );
}

const telegramMessageActions: ChannelMessageActionAdapter = {
  listActions: (ctx) =>
    getTelegramRuntime().channel.telegram.messageActions?.listActions?.(ctx) ?? [],
  getCapabilities: (ctx) =>
    getTelegramRuntime().channel.telegram.messageActions?.getCapabilities?.(ctx) ?? [],
  extractToolSend: (ctx) =>
    getTelegramRuntime().channel.telegram.messageActions?.extractToolSend?.(ctx) ?? null,
  handleAction: async (ctx) => {
    const ma = getTelegramRuntime().channel.telegram.messageActions;
    if (!ma?.handleAction) {
      throw new Error("Telegram message actions not available");
    }
    return ma.handleAction(ctx);
  },
};

const telegramConfigAccessors = createScopedAccountConfigAccessors({
  resolveAccount: resolveTelegramAccount,
  resolveAllowFrom: (account: ResolvedTelegramAccount) => account.config.allowFrom,
  formatAllowFrom: (allowFrom) =>
    formatAllowFromLowercase({ allowFrom, stripPrefixRe: /^(telegram|tg):/i }),
  resolveDefaultTo: (account: ResolvedTelegramAccount) => account.config.defaultTo,
});

const resolveTelegramAllowlistGroupOverrides = createNestedAllowlistOverrideResolver({
  resolveRecord: (account: ResolvedTelegramAccount) => account.config.groups,
  outerLabel: (groupId) => groupId,
  resolveOuterEntries: (groupCfg) => groupCfg?.allowFrom,
  resolveChildren: (groupCfg) => groupCfg?.topics,
  innerLabel: (groupId, topicId) => `${groupId} topic ${topicId}`,
  resolveInnerEntries: (topicCfg) => topicCfg?.allowFrom,
});

const collectTelegramSecurityWarnings =
  createAllowlistProviderRouteAllowlistWarningCollector<ResolvedTelegramAccount>({
    providerConfigPresent: (cfg) => cfg.channels?.telegram !== undefined,
    resolveGroupPolicy: (account) => account.config.groupPolicy,
    resolveRouteAllowlistConfigured: (account) =>
      Boolean(account.config.groups) && Object.keys(account.config.groups ?? {}).length > 0,
    restrictSenders: {
      surface: "Telegram groups",
      openScope: "any member in allowed groups",
      groupPolicyPath: "channels.telegram.groupPolicy",
      groupAllowFromPath: "channels.telegram.groupAllowFrom",
    },
    noRouteAllowlist: {
      surface: "Telegram groups",
      routeAllowlistPath: "channels.telegram.groups",
      routeScope: "group",
      groupPolicyPath: "channels.telegram.groupPolicy",
      groupAllowFromPath: "channels.telegram.groupAllowFrom",
    },
  });

export const telegramPlugin: ChannelPlugin<ResolvedTelegramAccount, TelegramProbe> = {
  ...createTelegramPluginBase({
    setupWizard: telegramSetupWizard,
    setup: telegramSetupAdapter,
  }),
  pairing: createTextPairingAdapter({
    idLabel: "telegramUserId",
    message: PAIRING_APPROVED_MESSAGE,
    normalizeAllowEntry: createPairingPrefixStripper(/^(telegram|tg):/i),
    notify: async ({ cfg, id, message }) => {
      const { token } = getTelegramRuntime().channel.telegram.resolveTelegramToken(cfg);
      if (!token) {
        throw new Error("telegram token not configured");
      }
      await getTelegramRuntime().channel.telegram.sendMessageTelegram(id, message, {
        token,
      });
    },
  }),
  allowlist: buildDmGroupAccountAllowlistAdapter({
    channelId: "telegram",
    resolveAccount: ({ cfg, accountId }) => resolveTelegramAccount({ cfg, accountId }),
    normalize: ({ cfg, accountId, values }) =>
      telegramConfigAdapter.formatAllowFrom!({ cfg, accountId, allowFrom: values }),
    resolveDmAllowFrom: (account) => account.config.allowFrom,
    resolveGroupAllowFrom: (account) => account.config.groupAllowFrom,
    resolveDmPolicy: (account) => account.config.dmPolicy,
    resolveGroupPolicy: (account) => account.config.groupPolicy,
    resolveGroupOverrides: resolveTelegramAllowlistGroupOverrides,
  }),
  bindings: {
    compileConfiguredBinding: ({ conversationId }) =>
      normalizeTelegramAcpConversationId(conversationId),
    matchInboundConversation: ({ compiledBinding, conversationId, parentConversationId }) =>
      matchTelegramAcpConversation({
        bindingConversationId: compiledBinding.conversationId,
        conversationId,
        parentConversationId,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "telegram",
        accountId,
        clearBaseFields: ["botToken", "tokenFile", "name"],
      }),
    isConfigured: (account, cfg) => {
      if (!account.token?.trim()) {
        return false;
      }
      return !findTelegramTokenOwnerAccountId({ cfg, accountId: account.accountId });
    },
    unconfiguredReason: (account, cfg) => {
      if (!account.token?.trim()) {
        return "not configured";
      }
      const ownerAccountId = findTelegramTokenOwnerAccountId({ cfg, accountId: account.accountId });
      if (!ownerAccountId) {
        return "not configured";
      }
      return formatDuplicateTelegramTokenReason({
        accountId: account.accountId,
        ownerAccountId,
      });
    },
    describeAccount: (account, cfg) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured:
        Boolean(account.token?.trim()) &&
        !findTelegramTokenOwnerAccountId({ cfg, accountId: account.accountId }),
      tokenSource: account.tokenSource,
    }),
    actions: telegramMessageActions,
    status: {
      defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
      collectStatusIssues: collectTelegramStatusIssues,
      buildChannelSummary: ({ snapshot }) => buildTokenChannelStatusSummary(snapshot),
      probeAccount: async ({ account, timeoutMs }) =>
        probeTelegram(account.token, timeoutMs, {
          accountId: account.accountId,
          proxyUrl: account.config.proxy,
          network: account.config.network,
          apiRoot: account.config.apiRoot,
        }),
      formatCapabilitiesProbe: ({ probe }) => {
        const lines = [];
        if (probe?.bot?.username) {
          const botId = probe.bot.id ? ` (${probe.bot.id})` : "";
          lines.push({ text: `Bot: @${probe.bot.username}${botId}` });
        }
        const flags: string[] = [];
        if (typeof probe?.bot?.canJoinGroups === "boolean") {
          flags.push(`joinGroups=${probe.bot.canJoinGroups}`);
        }
        if (typeof probe?.bot?.canReadAllGroupMessages === "boolean") {
          flags.push(`readAllGroupMessages=${probe.bot.canReadAllGroupMessages}`);
        }
        if (typeof probe?.bot?.supportsInlineQueries === "boolean") {
          flags.push(`inlineQueries=${probe.bot.supportsInlineQueries}`);
        }
        if (flags.length > 0) {
          lines.push({ text: `Flags: ${flags.join(" ")}` });
        }
        if (probe?.webhook?.url !== undefined) {
          lines.push({ text: `Webhook: ${probe.webhook.url || "none"}` });
        }
        return lines;
      },
      auditAccount: async ({ account, timeoutMs, probe, cfg }) => {
        const groups =
          cfg.channels?.telegram?.accounts?.[account.accountId]?.groups ??
          cfg.channels?.telegram?.groups;
        const { groupIds, unresolvedGroups, hasWildcardUnmentionedGroups } =
          collectTelegramUnmentionedGroupIds(groups);
        if (!groupIds.length && unresolvedGroups === 0 && !hasWildcardUnmentionedGroups) {
          return undefined;
        }
        const botId = probe?.ok && probe.bot?.id != null ? probe.bot.id : null;
        if (!botId) {
          return {
            ok: unresolvedGroups === 0 && !hasWildcardUnmentionedGroups,
            checkedGroups: 0,
            unresolvedGroups,
            hasWildcardUnmentionedGroups,
            groups: [],
            elapsedMs: 0,
          };
        }
        const audit = await auditTelegramGroupMembership({
          token: account.token,
          botId,
          groupIds,
          proxyUrl: account.config.proxy,
          network: account.config.network,
          apiRoot: account.config.apiRoot,
          timeoutMs,
        });
        return { ...audit, unresolvedGroups, hasWildcardUnmentionedGroups };
      },
      buildAccountSnapshot: ({ account, cfg, runtime, probe, audit }) => {
        const configuredFromStatus = resolveConfiguredFromCredentialStatuses(account);
        const ownerAccountId = findTelegramTokenOwnerAccountId({
          cfg,
          accountId: account.accountId,
        });
        const duplicateTokenReason = ownerAccountId
          ? formatDuplicateTelegramTokenReason({
              accountId: account.accountId,
              ownerAccountId,
            })
          : null;
        const configured =
          (configuredFromStatus ?? Boolean(account.token?.trim())) && !ownerAccountId;
        const groups =
          cfg.channels?.telegram?.accounts?.[account.accountId]?.groups ??
          cfg.channels?.telegram?.groups;
        const allowUnmentionedGroups =
          groups?.["*"]?.requireMention === false ||
          Object.entries(groups ?? {}).some(
            ([key, value]) => key !== "*" && value?.requireMention === false,
          );
        return {
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured,
          ...projectCredentialSnapshotFields(account),
          running: runtime?.running ?? false,
          lastStartAt: runtime?.lastStartAt ?? null,
          lastStopAt: runtime?.lastStopAt ?? null,
          lastError: runtime?.lastError ?? duplicateTokenReason,
          mode: runtime?.mode ?? (account.config.webhookUrl ? "webhook" : "polling"),
          probe,
          audit,
          allowUnmentionedGroups,
          lastInboundAt: runtime?.lastInboundAt ?? null,
          lastOutboundAt: runtime?.lastOutboundAt ?? null,
        };
      },
    },
    gateway: {
      startAccount: async (ctx) => {
        const account = ctx.account;
        const ownerAccountId = findTelegramTokenOwnerAccountId({
          cfg: ctx.cfg,
          accountId: account.accountId,
        });
        if (ownerAccountId) {
          const reason = formatDuplicateTelegramTokenReason({
            accountId: account.accountId,
            ownerAccountId,
          });
          ctx.log?.error?.(`[${account.accountId}] ${reason}`);
          throw new Error(reason);
        }
        const token = (account.token ?? "").trim();
        let telegramBotLabel = "";
        try {
          const probe = await probeTelegram(token, 2500, {
            accountId: account.accountId,
            proxyUrl: account.config.proxy,
            network: account.config.network,
            apiRoot: account.config.apiRoot,
          });
          const username = probe.ok ? probe.bot?.username?.trim() : null;
          if (username) {
            telegramBotLabel = ` (@${username})`;
          }
        } catch (err) {
          if (getTelegramRuntime().logging.shouldLogVerbose()) {
            ctx.log?.debug?.(`[${account.accountId}] bot probe failed: ${String(err)}`);
          }
        }
        ctx.log?.info(`[${account.accountId}] starting provider${telegramBotLabel}`);
        return monitorTelegramProvider({
          token,
          accountId: account.accountId,
          config: ctx.cfg,
          runtime: ctx.runtime,
          abortSignal: ctx.abortSignal,
          useWebhook: Boolean(account.config.webhookUrl),
          webhookUrl: account.config.webhookUrl,
          webhookSecret: account.config.webhookSecret,
          webhookPath: account.config.webhookPath,
          webhookHost: account.config.webhookHost,
          webhookPort: account.config.webhookPort,
          webhookCertPath: account.config.webhookCertPath,
        });
      },
      logoutAccount: async ({ accountId, cfg }) => {
        const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
        const nextCfg = { ...cfg } as RemoteClawConfig;
        const nextTelegram = cfg.channels?.telegram ? { ...cfg.channels.telegram } : undefined;
        let cleared = false;
        let changed = false;
        if (nextTelegram) {
          if (accountId === DEFAULT_ACCOUNT_ID && nextTelegram.botToken) {
            delete nextTelegram.botToken;
            cleared = true;
            changed = true;
          }
          const accountCleanup = clearAccountEntryFields({
            accounts: nextTelegram.accounts,
            accountId,
            fields: ["botToken"],
          });
          if (accountCleanup.changed) {
            changed = true;
            if (accountCleanup.cleared) {
              cleared = true;
            }
            if (accountCleanup.nextAccounts) {
              nextTelegram.accounts = accountCleanup.nextAccounts;
            } else {
              delete nextTelegram.accounts;
            }
          }
        }
        if (changed) {
          if (nextTelegram && Object.keys(nextTelegram).length > 0) {
            nextCfg.channels = { ...nextCfg.channels, telegram: nextTelegram };
          } else {
            const nextChannels = { ...nextCfg.channels };
            delete nextChannels.telegram;
            if (Object.keys(nextChannels).length > 0) {
              nextCfg.channels = nextChannels;
            } else {
              delete nextCfg.channels;
            }
          }
        }
        const resolved = resolveTelegramAccount({
          cfg: changed ? nextCfg : cfg,
          accountId,
        });
        const loggedOut = resolved.tokenSource === "none";
        if (changed) {
          await getTelegramRuntime().config.writeConfigFile(nextCfg);
        }
        return { cleared, envToken: Boolean(envToken), loggedOut };
      },
    },
  },
  pairing: {
    text: {
      idLabel: "telegramUserId",
      message: PAIRING_APPROVED_MESSAGE,
      normalizeAllowEntry: createPairingPrefixStripper(/^(telegram|tg):/i),
      notify: async ({ cfg, id, message }) => {
        const { token } = getTelegramRuntime().channel.telegram.resolveTelegramToken(cfg);
        if (!token) {
          throw new Error("telegram token not configured");
        }
        await getTelegramRuntime().channel.telegram.sendMessageTelegram(id, message, {
          token,
        });
      },
    },
  },
  security: {
    resolveDmPolicy: resolveTelegramDmPolicy,
    collectWarnings: collectTelegramSecurityWarnings,
  },
  groups: {
    resolveRequireMention: resolveTelegramGroupRequireMention,
    resolveToolPolicy: resolveTelegramGroupToolPolicy,
  },
  threading: {
    resolveReplyToMode: createTopLevelChannelReplyToModeResolver("telegram"),
    resolveAutoThreadId: ({ to, toolContext, replyToId }) =>
      replyToId ? undefined : resolveTelegramAutoThreadId({ to, toolContext }),
  },
  messaging: {
    normalizeTarget: normalizeTelegramMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeTelegramTargetId,
      hint: "<chatId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async (params) => listTelegramDirectoryPeersFromConfig(params),
    listGroups: async (params) => listTelegramDirectoryGroupsFromConfig(params),
  },
  actions: telegramMessageActions,
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "telegram",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "TELEGRAM_BOT_TOKEN can only be used for the default account.";
      }
      if (!input.useEnv && !input.token && !input.tokenFile) {
        return "Telegram requires token or --token-file (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "telegram",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "telegram",
            })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            telegram: {
              ...next.channels?.telegram,
              enabled: true,
              ...(input.useEnv
                ? {}
                : input.tokenFile
                  ? { tokenFile: input.tokenFile }
                  : input.token
                    ? { botToken: input.token }
                    : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          telegram: {
            ...next.channels?.telegram,
            enabled: true,
            accounts: {
              ...next.channels?.telegram?.accounts,
              [accountId]: {
                ...next.channels?.telegram?.accounts?.[accountId],
                enabled: true,
                ...(input.tokenFile
                  ? { tokenFile: input.tokenFile }
                  : input.token
                    ? { botToken: input.token }
                    : {}),
              },
            },
          },
        },
      };
    },
    beforeDeliverPending: async ({ cfg, target, payload }) => {
      const hasExecApprovalData =
        payload.channelData &&
        typeof payload.channelData === "object" &&
        !Array.isArray(payload.channelData) &&
        payload.channelData.execApproval;
      if (!hasExecApprovalData) {
        return;
      }
      const threadId =
        typeof target.threadId === "number"
          ? target.threadId
          : typeof target.threadId === "string"
            ? Number.parseInt(target.threadId, 10)
            : undefined;
      await sendTypingTelegram(target.to, {
        cfg,
        accountId: target.accountId ?? undefined,
        ...(Number.isFinite(threadId) ? { messageThreadId: threadId } : {}),
      }).catch(() => {});
    },
  },
  directory: createChannelDirectoryAdapter({
    listPeers: async (params) => listTelegramDirectoryPeersFromConfig(params),
    listGroups: async (params) => listTelegramDirectoryGroupsFromConfig(params),
  }),
  actions: telegramMessageActions,
  setup: telegramSetupAdapter,
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getTelegramRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    pollMaxOptions: 10,
    shouldSkipPlainTextSanitization: ({ payload }) => Boolean(payload.channelData),
    resolveEffectiveTextChunkLimit: ({ fallbackLimit }) =>
      typeof fallbackLimit === "number" ? Math.min(fallbackLimit, 4096) : 4096,
    sendPayload: async ({
      cfg,
      to,
      payload,
      mediaLocalRoots,
      accountId,
      deps,
      replyToId,
      threadId,
      silent,
      forceDocument,
    }) => {
      const send =
        resolveOutboundSendDep<TelegramSendFn>(deps, "telegram") ??
        getTelegramRuntime().channel.telegram.sendMessageTelegram;
      const result = await sendTelegramPayloadMessages({
        send,
        to,
        payload,
        baseOpts: buildTelegramSendOptions({
          cfg,
          mediaLocalRoots,
          accountId,
          replyToId,
          threadId,
          silent,
          forceDocument,
        }),
      });
      return attachChannelToResult("telegram", result);
    },
    ...createAttachedChannelResultAdapter({
      channel: "telegram",
      sendText: async ({ cfg, to, text, accountId, deps, replyToId, threadId, silent }) =>
        await sendTelegramOutbound({
          cfg,
          to,
          text,
          accountId,
          deps,
          replyToId,
          threadId,
          silent,
        }),
      sendMedia: async ({
        cfg,
        mediaUrl,
        mediaLocalRoots,
        accountId,
        deps,
        replyToId,
        threadId,
        silent,
      }) =>
        await sendTelegramOutbound({
          cfg,
          to,
          text,
          mediaUrl,
          mediaLocalRoots,
          accountId,
          deps,
          replyToId,
          threadId,
          silent,
        }),
      sendPoll: async ({ cfg, to, poll, accountId, threadId, silent, isAnonymous }) =>
        await getTelegramRuntime().channel.telegram.sendPollTelegram(to, poll, {
          cfg,
          accountId: accountId ?? undefined,
          messageThreadId: parseTelegramThreadId(threadId),
          silent: silent ?? undefined,
          isAnonymous: isAnonymous ?? undefined,
        }),
    }),
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: collectTelegramStatusIssues,
    buildChannelSummary: ({ snapshot }) => buildTokenChannelStatusSummary(snapshot),
    probeAccount: async ({ account, timeoutMs }) =>
      getTelegramRuntime().channel.telegram.probeTelegram(account.token, timeoutMs, {
        accountId: account.accountId,
        proxyUrl: account.config.proxy,
        network: account.config.network,
        apiRoot: account.config.apiRoot,
      }),
    auditAccount: async ({ account, timeoutMs, probe, cfg }) => {
      const groups =
        cfg.channels?.telegram?.accounts?.[account.accountId]?.groups ??
        cfg.channels?.telegram?.groups;
      const { groupIds, unresolvedGroups, hasWildcardUnmentionedGroups } =
        getTelegramRuntime().channel.telegram.collectUnmentionedGroupIds(groups);
      if (!groupIds.length && unresolvedGroups === 0 && !hasWildcardUnmentionedGroups) {
        return undefined;
      }
      const botId = probe?.ok && probe.bot?.id != null ? probe.bot.id : null;
      if (!botId) {
        return {
          ok: unresolvedGroups === 0 && !hasWildcardUnmentionedGroups,
          checkedGroups: 0,
          unresolvedGroups,
          hasWildcardUnmentionedGroups,
          groups: [],
          elapsedMs: 0,
        };
      }
      const audit = await getTelegramRuntime().channel.telegram.auditGroupMembership({
        token: account.token,
        botId,
        groupIds,
        proxyUrl: account.config.proxy,
        network: account.config.network,
        apiRoot: account.config.apiRoot,
        timeoutMs,
      });
      return { ...audit, unresolvedGroups, hasWildcardUnmentionedGroups };
    },
    buildAccountSnapshot: ({ account, cfg, runtime, probe, audit }) => {
      const ownerAccountId = findTelegramTokenOwnerAccountId({
        cfg,
        accountId: account.accountId,
      });
      const duplicateTokenReason = ownerAccountId
        ? formatDuplicateTelegramTokenReason({
            accountId: account.accountId,
            ownerAccountId,
          })
        : null;
      const configured = Boolean(account.token?.trim()) && !ownerAccountId;
      const groups =
        cfg.channels?.telegram?.accounts?.[account.accountId]?.groups ??
        cfg.channels?.telegram?.groups;
      const allowUnmentionedGroups =
        groups?.["*"]?.requireMention === false ||
        Object.entries(groups ?? {}).some(
          ([key, value]) => key !== "*" && value?.requireMention === false,
        );
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? duplicateTokenReason,
        mode: runtime?.mode ?? (account.config.webhookUrl ? "webhook" : "polling"),
        probe,
        audit,
        allowUnmentionedGroups,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const ownerAccountId = findTelegramTokenOwnerAccountId({
        cfg: ctx.cfg,
        accountId: account.accountId,
      });
      if (ownerAccountId) {
        const reason = formatDuplicateTelegramTokenReason({
          accountId: account.accountId,
          ownerAccountId,
        });
        ctx.log?.error?.(`[${account.accountId}] ${reason}`);
        throw new Error(reason);
      }
      const token = (account.token ?? "").trim();
      let telegramBotLabel = "";
      try {
        const probe = await getTelegramRuntime().channel.telegram.probeTelegram(token, 2500, {
          accountId: account.accountId,
          proxyUrl: account.config.proxy,
          network: account.config.network,
          apiRoot: account.config.apiRoot,
        });
        const username = probe.ok ? probe.bot?.username?.trim() : null;
        if (username) {
          telegramBotLabel = ` (@${username})`;
        }
      } catch (err) {
        if (getTelegramRuntime().logging.shouldLogVerbose()) {
          ctx.log?.debug?.(`[${account.accountId}] bot probe failed: ${String(err)}`);
        }
      }
      ctx.log?.info(`[${account.accountId}] starting provider${telegramBotLabel}`);
      return getTelegramRuntime().channel.telegram.monitorTelegramProvider({
        token,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        useWebhook: Boolean(account.config.webhookUrl),
        webhookUrl: account.config.webhookUrl,
        webhookSecret: account.config.webhookSecret,
        webhookPath: account.config.webhookPath,
        webhookHost: account.config.webhookHost,
        webhookPort: account.config.webhookPort,
        webhookCertPath: account.config.webhookCertPath,
      });
    },
    logoutAccount: async ({ accountId, cfg }) => {
      const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
      const nextCfg = { ...cfg } as RemoteClawConfig;
      const nextTelegram = cfg.channels?.telegram ? { ...cfg.channels.telegram } : undefined;
      let cleared = false;
      let changed = false;
      if (nextTelegram) {
        if (accountId === DEFAULT_ACCOUNT_ID && nextTelegram.botToken) {
          delete nextTelegram.botToken;
          cleared = true;
          changed = true;
        }
        const accountCleanup = clearAccountEntryFields({
          accounts: nextTelegram.accounts,
          accountId,
          fields: ["botToken"],
        });
        if (accountCleanup.changed) {
          changed = true;
          if (accountCleanup.cleared) {
            cleared = true;
          }
          if (accountCleanup.nextAccounts) {
            nextTelegram.accounts = accountCleanup.nextAccounts;
          } else {
            delete nextTelegram.accounts;
          }
        }
      }
      if (changed) {
        if (nextTelegram && Object.keys(nextTelegram).length > 0) {
          nextCfg.channels = { ...nextCfg.channels, telegram: nextTelegram };
        } else {
          const nextChannels = { ...nextCfg.channels };
          delete nextChannels.telegram;
          if (Object.keys(nextChannels).length > 0) {
            nextCfg.channels = nextChannels;
          } else {
            delete nextCfg.channels;
          }
        }
      }
      const resolved = resolveTelegramAccount({
        cfg: changed ? nextCfg : cfg,
        accountId,
      });
      const loggedOut = resolved.tokenSource === "none";
      if (changed) {
        await getTelegramRuntime().config.writeConfigFile(nextCfg);
      }
      return { cleared, envToken: Boolean(envToken), loggedOut };
    },
  },
};
