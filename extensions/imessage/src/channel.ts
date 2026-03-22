import { buildDmGroupAccountAllowlistAdapter } from "remoteclaw/plugin-sdk/allowlist-config-edit";
import { createChatChannelPlugin } from "remoteclaw/plugin-sdk/core";
import { buildPassiveProbedChannelStatusSummary } from "remoteclaw/plugin-sdk/extension-shared";
import { createLazyRuntimeModule } from "remoteclaw/plugin-sdk/lazy-runtime";
import { resolveOutboundSendDep } from "remoteclaw/plugin-sdk/outbound-runtime";
import { buildOutboundBaseSessionKey, type RoutePeer } from "remoteclaw/plugin-sdk/routing";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "remoteclaw/plugin-sdk/status-helpers";
import {
  collectStatusIssuesFromLastError,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatTrimmedAllowFromEntries,
  normalizeIMessageMessagingTarget,
  PAIRING_APPROVED_MESSAGE,
  resolveChannelMediaMaxBytes,
  resolveDefaultIMessageAccountId,
  resolveIMessageAccount,
  resolveIMessageConfigAllowFrom,
  resolveIMessageConfigDefaultTo,
  resolveIMessageGroupRequireMention,
  resolveIMessageGroupToolPolicy,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type ResolvedIMessageAccount,
} from "remoteclaw/plugin-sdk/imessage";
import { getIMessageRuntime } from "./runtime.js";
import { imessageSetupAdapter } from "./setup-core.js";
import {
  collectIMessageSecurityWarnings,
  createIMessagePluginBase,
  imessageConfigAdapter,
  imessageResolveDmPolicy,
  imessageSetupWizard,
} from "./shared.js";
import {
  inferIMessageTargetChatType,
  looksLikeIMessageExplicitTargetId,
  normalizeIMessageHandle,
  parseIMessageTarget,
} from "./targets.js";

const resolveIMessageDmPolicy = createScopedDmSecurityResolver<ResolvedIMessageAccount>({
  channelKey: "imessage",
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  policyPathSuffix: "dmPolicy",
});

function buildIMessageBaseSessionKey(params: {
  cfg: Parameters<typeof resolveIMessageAccount>[0]["cfg"];
  agentId: string;
  accountId?: string | null;
  peer: RoutePeer;
}) {
  return {
    ...(input.cliPath ? { cliPath: input.cliPath } : {}),
    ...(input.dbPath ? { dbPath: input.dbPath } : {}),
    ...(input.service ? { service: input.service } : {}),
    ...(input.region ? { region: input.region } : {}),
  };
}

type IMessageSendFn = ReturnType<
  typeof getIMessageRuntime
>["channel"]["imessage"]["sendMessageIMessage"];

async function sendIMessageOutbound(params: {
  cfg: Parameters<typeof resolveIMessageAccount>[0]["cfg"];
  to: string;
  text: string;
  mediaUrl?: string;
  mediaLocalRoots?: readonly string[];
  accountId?: string;
  deps?: { sendIMessage?: IMessageSendFn };
  replyToId?: string;
}) {
  const send =
    params.deps?.sendIMessage ?? getIMessageRuntime().channel.imessage.sendMessageIMessage;
  const maxBytes = resolveChannelMediaMaxBytes({
    cfg: params.cfg,
    resolveChannelLimitMb: ({ cfg, accountId }) =>
      cfg.channels?.imessage?.accounts?.[accountId]?.mediaMaxMb ??
      cfg.channels?.imessage?.mediaMaxMb,
    accountId: params.accountId,
  });
  return await send(params.to, params.text, {
    config: params.cfg,
    ...(params.mediaUrl ? { mediaUrl: params.mediaUrl } : {}),
    ...(params.mediaLocalRoots?.length ? { mediaLocalRoots: params.mediaLocalRoots } : {}),
    maxBytes,
    accountId: params.accountId ?? undefined,
    replyToId: params.replyToId ?? undefined,
  });
}

export const imessagePlugin: ChannelPlugin<ResolvedIMessageAccount, IMessageProbe> =
  createChatChannelPlugin<ResolvedIMessageAccount, IMessageProbe>({
    base: {
      ...createIMessagePluginBase({
        setupWizard: imessageSetupWizard,
        setup: imessageSetupAdapter,
      }),
      allowlist: buildDmGroupAccountAllowlistAdapter({
        channelId: "imessage",
        resolveAccount: resolveIMessageAccount,
        normalize: ({ values }) => formatTrimmedAllowFromEntries(values),
        resolveDmAllowFrom: (account) => account.config.allowFrom,
        resolveGroupAllowFrom: (account) => account.config.groupAllowFrom,
        resolveDmPolicy: (account) => account.config.dmPolicy,
        resolveGroupPolicy: (account) => account.config.groupPolicy,
      }),
      groups: {
        resolveRequireMention: resolveIMessageGroupRequireMention,
        resolveToolPolicy: resolveIMessageGroupToolPolicy,
      },
      messaging: {
        normalizeTarget: normalizeIMessageMessagingTarget,
        inferTargetChatType: ({ to }) => inferIMessageTargetChatType(to),
        resolveOutboundSessionRoute: (params) => resolveIMessageOutboundSessionRoute(params),
        targetResolver: {
          looksLikeId: looksLikeIMessageExplicitTargetId,
          hint: "<handle|chat_id:ID>",
          resolveTarget: async ({ normalized }) => {
            const to = normalized?.trim();
            if (!to) {
              return null;
            }
            const chatType = inferIMessageTargetChatType(to);
            if (!chatType) {
              return null;
            }
            return {
              to,
              kind: chatType === "direct" ? "user" : "group",
              source: "normalized" as const,
            };
          },
        },
      },
      status: createComputedAccountStatusAdapter<ResolvedIMessageAccount, IMessageProbe>({
        defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, {
          cliPath: null,
          dbPath: null,
        }),
        collectStatusIssues: (accounts) => collectStatusIssuesFromLastError("imessage", accounts),
        buildChannelSummary: ({ snapshot }) =>
          buildPassiveProbedChannelStatusSummary(snapshot, {
            cliPath: snapshot.cliPath ?? null,
            dbPath: snapshot.dbPath ?? null,
          }),
        probeAccount: async ({ timeoutMs }) =>
          await (await loadIMessageChannelRuntime()).probeIMessageAccount(timeoutMs),
        resolveAccountSnapshot: ({ account, runtime }) => ({
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: account.configured,
          extra: {
            cliPath: runtime?.cliPath ?? account.config.cliPath ?? null,
            dbPath: runtime?.dbPath ?? account.config.dbPath ?? null,
          },
        }),
        resolveAccountState: ({ enabled }) => (enabled ? "enabled" : "disabled"),
      }),
      gateway: {
        startAccount: async (ctx) =>
          await (await loadIMessageChannelRuntime()).startIMessageGatewayAccount(ctx),
      },
    },
    pairing: {
      text: {
        idLabel: "imessageSenderId",
        message: "OpenClaw: your access has been approved.",
        notify: async ({ id }) =>
          await (await loadIMessageChannelRuntime()).notifyIMessageApproval(id),
      },
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getIMessageRuntime().channel.text.chunkText(text, limit),
    chunkerMode: "text",
    textChunkLimit: 4000,
    ...createAttachedChannelResultAdapter({
      channel: "imessage",
      sendText: async ({ cfg, to, text, accountId, deps, replyToId }) =>
        await (
          await loadIMessageChannelRuntime()
        ).sendIMessageOutbound({
          cfg,
          to,
          text,
          accountId: accountId ?? undefined,
          deps,
          replyToId: replyToId ?? undefined,
        }),
      sendMedia: async ({ cfg, to, text, mediaUrl, mediaLocalRoots, accountId, deps, replyToId }) =>
        await (
          await loadIMessageChannelRuntime()
        ).sendIMessageOutbound({
          cfg,
          to,
          text,
          mediaUrl,
          mediaLocalRoots,
          accountId: accountId ?? undefined,
          deps,
          replyToId: replyToId ?? undefined,
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
      cliPath: null,
      dbPath: null,
    },
    collectStatusIssues: (accounts) => collectStatusIssuesFromLastError("imessage", accounts),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      cliPath: snapshot.cliPath ?? null,
      dbPath: snapshot.dbPath ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ timeoutMs }) =>
      getIMessageRuntime().channel.imessage.probeIMessage(timeoutMs),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      cliPath: runtime?.cliPath ?? account.config.cliPath ?? null,
      dbPath: runtime?.dbPath ?? account.config.dbPath ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
    resolveAccountState: ({ enabled }) => (enabled ? "enabled" : "disabled"),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const cliPath = account.config.cliPath?.trim() || "imsg";
      const dbPath = account.config.dbPath?.trim();
      ctx.setStatus({
        accountId: account.accountId,
        cliPath,
        dbPath: dbPath ?? null,
      });
      ctx.log?.info(
        `[${account.accountId}] starting provider (${cliPath}${dbPath ? ` db=${dbPath}` : ""})`,
      );
      return getIMessageRuntime().channel.imessage.monitorIMessageProvider({
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
      });
    },
  },
};
