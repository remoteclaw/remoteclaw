import { formatNormalizedAllowFromEntries } from "remoteclaw/plugin-sdk/allow-from";
import { createMessageToolButtonsSchema } from "remoteclaw/plugin-sdk/channel-actions";
import {
  createScopedChannelConfigAdapter,
  createScopedDmSecurityResolver,
} from "remoteclaw/plugin-sdk/channel-config-helpers";
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelMessageToolDiscovery,
} from "remoteclaw/plugin-sdk/channel-contract";
import { createLoggedPairingApprovalNotifier } from "remoteclaw/plugin-sdk/channel-pairing";
import { createAllowlistProviderRestrictSendersWarningCollector } from "remoteclaw/plugin-sdk/channel-policy";
import { createAttachedChannelResultAdapter } from "remoteclaw/plugin-sdk/channel-send-result";
import { createScopedAccountReplyToModeResolver } from "remoteclaw/plugin-sdk/conversation-runtime";
import { createChannelDirectoryAdapter } from "remoteclaw/plugin-sdk/directory-runtime";
import { buildPassiveProbedChannelStatusSummary } from "remoteclaw/plugin-sdk/extension-shared";
import { MattermostConfigSchema } from "./config-schema.js";
import { resolveMattermostGroupRequireMention } from "./group-mentions.js";
import {
  looksLikeMattermostTargetId,
  normalizeMattermostMessagingTarget,
} from "./normalize.js";
import { mattermostOnboardingAdapter } from "./onboarding.js";
import {
  listMattermostAccountIds,
  resolveDefaultMattermostAccountId,
  resolveMattermostAccount,
  type ResolvedMattermostAccount,
} from "./mattermost/accounts.js";
import { normalizeMattermostBaseUrl } from "./mattermost/client.js";
import { monitorMattermostProvider } from "./mattermost/monitor.js";
import { probeMattermost } from "./mattermost/probe.js";
import { sendMessageMattermost } from "./mattermost/send.js";
import { resolveMattermostOpaqueTarget } from "./mattermost/target-resolution.js";
import { looksLikeMattermostTargetId, normalizeMattermostMessagingTarget } from "./normalize.js";
import {
  buildComputedAccountStatusSnapshot,
  buildChannelConfigSchema,
  createAccountStatusSink,
  DEFAULT_ACCOUNT_ID,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  type ChannelPlugin,
} from "./runtime-api.js";
import { getMattermostRuntime } from "./runtime.js";
import { mattermostSetupAdapter } from "./setup-core.js";

const meta = {
  id: "mattermost",
  label: "Mattermost",
  selectionLabel: "Mattermost (plugin)",
  detailLabel: "Mattermost Bot",
  docsPath: "/channels/mattermost",
  docsLabel: "mattermost",
  blurb: "self-hosted Slack-style chat; install the plugin to enable.",
  systemImage: "bubble.left.and.bubble.right",
  order: 65,
} as const;

export const mattermostPlugin: ChannelPlugin<ResolvedMattermostAccount> = {
  id: "mattermost",
  meta: {
    ...meta,
  },
  onboarding: mattermostOnboardingAdapter,
  pairing: {
    idLabel: "mattermostUserId",
    normalizeAllowEntry: (entry) => normalizeAllowEntry(entry),
    notifyApproval: async ({ id }) => {
      console.log(`[mattermost] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel", "group", "thread"],
    reactions: true,
    threads: true,
    media: true,
    nativeCommands: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  threading: {
    resolveReplyToMode: ({ cfg, accountId, chatType }) => {
      const account = resolveMattermostAccount({ cfg, accountId: accountId ?? "default" });
      const kind =
        chatType === "direct" || chatType === "group" || chatType === "channel"
          ? chatType
          : "channel";
      return resolveMattermostReplyToMode(account, kind);
    },
  },
  reload: { configPrefixes: ["channels.mattermost"] },
  configSchema: buildChannelConfigSchema(MattermostConfigSchema),
  config: {
    listAccountIds: (cfg) => listMattermostAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveMattermostAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultMattermostAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "mattermost",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "mattermost",
        accountId,
        clearBaseFields: ["botToken", "baseUrl", "name"],
      }),
    isConfigured: (account) => Boolean(account.botToken && account.baseUrl),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.botToken && account.baseUrl),
      botTokenSource: account.botTokenSource,
      baseUrl: account.baseUrl,
    }),
    ...mattermostConfigAccessors,
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      return buildAccountScopedDmSecurityPolicy({
        cfg,
        channelKey: "mattermost",
        accountId,
        fallbackAccountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        policy: account.config.dmPolicy,
        allowFrom: account.config.allowFrom ?? [],
        policyPathSuffix: "dmPolicy",
        normalizeEntry: (raw) => normalizeAllowEntry(raw),
      });
    },
    collectWarnings: ({ account, cfg }) => {
      return collectAllowlistProviderRestrictSendersWarnings({
        cfg,
        providerConfigPresent: cfg.channels?.mattermost !== undefined,
        configuredGroupPolicy: account.config.groupPolicy,
        surface: "Mattermost channels",
        openScope: "any member",
        groupPolicyPath: "channels.mattermost.groupPolicy",
        groupAllowFromPath: "channels.mattermost.groupAllowFrom",
      });
    },
  },
  groups: {
    resolveRequireMention: resolveMattermostGroupRequireMention,
  },
  actions: mattermostMessageActions,
  directory: {
    listGroups: async (params) => listMattermostDirectoryGroups(params),
    listGroupsLive: async (params) => listMattermostDirectoryGroups(params),
    listPeers: async (params) => listMattermostDirectoryPeers(params),
    listPeersLive: async (params) => listMattermostDirectoryPeers(params),
  },
  messaging: {
    normalizeTarget: normalizeMattermostMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeMattermostTargetId,
      hint: "<channelId|user:ID|channel:ID>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getMattermostRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: new Error(
            "Delivering to Mattermost requires --to <channelId|@username|user:ID|channel:ID>",
          ),
        };
      }
      return { ok: true, to: trimmed };
    },
    sendText: async ({ to, text, accountId, deps, replyToId }) => {
      const send = deps?.sendMattermost ?? sendMessageMattermost;
      const result = await send(to, text, {
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? (threadId != null ? String(threadId) : undefined),
      });
      return { channel: "mattermost", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId }) => {
      const send = deps?.sendMattermost ?? sendMessageMattermost;
      const result = await send(to, text, {
        accountId: accountId ?? undefined,
        mediaUrl,
        mediaLocalRoots,
        replyToId: replyToId ?? (threadId != null ? String(threadId) : undefined),
      });
      return { channel: "mattermost", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      botTokenSource: snapshot.botTokenSource ?? "none",
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      baseUrl: snapshot.baseUrl ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => {
      const token = account.botToken?.trim();
      const baseUrl = account.baseUrl?.trim();
      if (!token || !baseUrl) {
        return { ok: false, error: "bot token or baseUrl missing" };
      }
      return await probeMattermost(baseUrl, token, timeoutMs);
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "mattermost",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "Mattermost env vars can only be used for the default account.";
      }
      const token = input.botToken ?? input.token;
      const baseUrl = input.httpUrl;
      if (!input.useEnv && (!token || !baseUrl)) {
        return "Mattermost requires --bot-token and --http-url (or --use-env).";
      }
      if (baseUrl && !normalizeMattermostBaseUrl(baseUrl)) {
        return "Mattermost --http-url must include a valid base URL.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const token = input.botToken ?? input.token;
      const baseUrl = input.httpUrl?.trim();
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "mattermost",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "mattermost",
            })
          : namedConfig;
      const patch = input.useEnv
        ? {}
        : {
            ...(token ? { botToken: token } : {}),
            ...(baseUrl ? { baseUrl } : {}),
          };
      return applySetupAccountConfigPatch({
        cfg: next,
        channelKey: "mattermost",
        accountId,
        patch,
      });
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        baseUrl: account.baseUrl,
        botTokenSource: account.botTokenSource,
      });
      ctx.log?.info(`[${account.accountId}] starting channel`);
      return monitorMattermostProvider({
        botToken: account.botToken ?? undefined,
        baseUrl: account.baseUrl ?? undefined,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
  },
};
