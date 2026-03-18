import { buildDmGroupAccountAllowlistAdapter } from "remoteclaw/plugin-sdk/allowlist-config-edit";
import {
  createPairingPrefixStripper,
  createTextPairingAdapter,
  resolveOutboundSendDep,
} from "remoteclaw/plugin-sdk/channel-runtime";
import { resolveMarkdownTableMode } from "remoteclaw/plugin-sdk/config-runtime";
import { buildOutboundBaseSessionKey } from "remoteclaw/plugin-sdk/core";
import { resolveTextChunkLimit } from "remoteclaw/plugin-sdk/reply-runtime";
import { type RoutePeer } from "remoteclaw/plugin-sdk/routing";
import { resolveSignalAccount, type ResolvedSignalAccount } from "./accounts.js";
import { markdownToSignalTextChunks } from "./format.js";
import {
  buildAccountScopedDmSecurityPolicy,
  createScopedAccountConfigAccessors,
  collectAllowlistProviderRestrictSendersWarnings,
} from "remoteclaw/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  buildChannelConfigSchema,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  getChatChannelMeta,
  listSignalAccountIds,
  looksLikeSignalTargetId,
  mapAllowFromEntries,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  normalizeE164,
  normalizeSignalMessagingTarget,
  PAIRING_APPROVED_MESSAGE,
  resolveChannelMediaMaxBytes,
  resolveDefaultSignalAccountId,
  resolveOptionalConfigString,
  resolveSignalAccount,
  setAccountEnabledInConfigSection,
  signalOnboardingAdapter,
  SignalConfigSchema,
  type ChannelMessageActionAdapter,
  type ChannelPlugin,
  type ResolvedSignalAccount,
} from "remoteclaw/plugin-sdk/signal";
import { getSignalRuntime } from "./runtime.js";
import { signalSetupAdapter } from "./setup-core.js";
import {
  collectSignalSecurityWarnings,
  signalConfigAdapter,
  createSignalPluginBase,
  signalResolveDmPolicy,
  signalSetupWizard,
} from "./shared.js";
type SignalSendFn = ReturnType<typeof getSignalRuntime>["channel"]["signal"]["sendMessageSignal"];

const signalMessageActions: ChannelMessageActionAdapter = {
  listActions: (ctx) => getSignalRuntime().channel.signal.messageActions?.listActions?.(ctx) ?? [],
  supportsAction: (ctx) =>
    getSignalRuntime().channel.signal.messageActions?.supportsAction?.(ctx) ?? false,
  handleAction: async (ctx) => {
    const ma = getSignalRuntime().channel.signal.messageActions;
    if (!ma?.handleAction) {
      throw new Error("Signal message actions not available");
    }
    return ma.handleAction(ctx);
  },
};

const meta = getChatChannelMeta("signal");

const signalConfigAccessors = createScopedAccountConfigAccessors({
  resolveAccount: resolveSignalAccount,
  resolveAllowFrom: (account: ResolvedSignalAccount) => account.config.allowFrom,
  formatAllowFrom: (allowFrom) =>
    allowFrom
      .map((entry) => String(entry).trim())
      .filter(Boolean)
      .map((entry) => (entry === "*" ? "*" : normalizeE164(entry.replace(/^signal:/i, ""))))
      .filter(Boolean),
  resolveDefaultTo: (account: ResolvedSignalAccount) => account.config.defaultTo,
});

function buildSignalSetupPatch(input: {
  signalNumber?: string;
  cliPath?: string;
  httpUrl?: string;
  httpHost?: string;
  httpPort?: string;
}) {
  return {
    ...(input.signalNumber ? { account: input.signalNumber } : {}),
    ...(input.cliPath ? { cliPath: input.cliPath } : {}),
    ...(input.httpUrl ? { httpUrl: input.httpUrl } : {}),
    ...(input.httpHost ? { httpHost: input.httpHost } : {}),
    ...(input.httpPort ? { httpPort: Number(input.httpPort) } : {}),
  };
}

type SignalSendFn = ReturnType<typeof getSignalRuntime>["channel"]["signal"]["sendMessageSignal"];

async function sendSignalOutbound(params: {
  cfg: Parameters<typeof resolveSignalAccount>[0]["cfg"];
  to: string;
  text: string;
  mediaUrl?: string;
  mediaLocalRoots?: readonly string[];
  accountId?: string;
  deps?: { sendSignal?: SignalSendFn };
}) {
  const send = params.deps?.sendSignal ?? getSignalRuntime().channel.signal.sendMessageSignal;
  const maxBytes = resolveChannelMediaMaxBytes({
    cfg: params.cfg,
    resolveChannelLimitMb: ({ cfg, accountId }) =>
      cfg.channels?.signal?.accounts?.[accountId]?.mediaMaxMb ?? cfg.channels?.signal?.mediaMaxMb,
    accountId: params.accountId,
  });
  return await send(params.to, params.text, {
    cfg: params.cfg,
    ...(params.mediaUrl ? { mediaUrl: params.mediaUrl } : {}),
    ...(params.mediaLocalRoots?.length ? { mediaLocalRoots: params.mediaLocalRoots } : {}),
    maxBytes,
    accountId: params.accountId ?? undefined,
  });
}

export const signalPlugin: ChannelPlugin<ResolvedSignalAccount> = {
  ...createSignalPluginBase({
    setupWizard: signalSetupWizard,
    setup: signalSetupAdapter,
  }),
  pairing: createTextPairingAdapter({
    idLabel: "signalNumber",
    message: PAIRING_APPROVED_MESSAGE,
    normalizeAllowEntry: createPairingPrefixStripper(/^signal:/i),
    notify: async ({ id, message }) => {
      await getSignalRuntime().channel.signal.sendMessageSignal(id, message);
    },
  }),
  actions: signalMessageActions,
  allowlist: buildDmGroupAccountAllowlistAdapter({
    channelId: "signal",
    resolveAccount: ({ cfg, accountId }) => resolveSignalAccount({ cfg, accountId }),
    normalize: ({ cfg, accountId, values }) =>
      signalConfigAdapter.formatAllowFrom!({ cfg, accountId, allowFrom: values }),
    resolveDmAllowFrom: (account) => account.config.allowFrom,
    resolveGroupAllowFrom: (account) => account.config.groupAllowFrom,
    resolveDmPolicy: (account) => account.config.dmPolicy,
    resolveGroupPolicy: (account) => account.config.groupPolicy,
  }),
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      return buildAccountScopedDmSecurityPolicy({
        cfg,
        channelKey: "signal",
        accountId,
        fallbackAccountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        policy: account.config.dmPolicy,
        allowFrom: account.config.allowFrom ?? [],
        policyPathSuffix: "dmPolicy",
        normalizeEntry: (raw) => normalizeE164(raw.replace(/^signal:/i, "").trim()),
      });
    },
    collectWarnings: ({ account, cfg }) => {
      return collectAllowlistProviderRestrictSendersWarnings({
        cfg,
        providerConfigPresent: cfg.channels?.signal !== undefined,
        configuredGroupPolicy: account.config.groupPolicy,
        surface: "Signal groups",
        openScope: "any member",
        groupPolicyPath: "channels.signal.groupPolicy",
        groupAllowFromPath: "channels.signal.groupAllowFrom",
        mentionGated: false,
      });
    },
  },
  messaging: {
    normalizeTarget: normalizeSignalMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeSignalTargetId,
      hint: "<E.164|uuid:ID|group:ID|signal:group:ID|signal:+E.164>",
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "signal",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      if (
        !input.signalNumber &&
        !input.httpUrl &&
        !input.httpHost &&
        !input.httpPort &&
        !input.cliPath
      ) {
        return "Signal requires --signal-number or --http-url/--http-host/--http-port/--cli-path.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "signal",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "signal",
            })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            signal: {
              ...next.channels?.signal,
              enabled: true,
              ...buildSignalSetupPatch(input),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          signal: {
            ...next.channels?.signal,
            enabled: true,
            accounts: {
              ...next.channels?.signal?.accounts,
              [accountId]: {
                ...next.channels?.signal?.accounts?.[accountId],
                enabled: true,
                ...buildSignalSetupPatch(input),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getSignalRuntime().channel.text.chunkText(text, limit),
    chunkerMode: "text",
    textChunkLimit: 4000,
    sendText: async ({ cfg, to, text, accountId, deps }) => {
      const result = await sendSignalOutbound({
        cfg,
        to,
        text,
        accountId: accountId ?? undefined,
        deps,
      });
      return { channel: "signal", ...result };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, mediaLocalRoots, accountId, deps }) => {
      const result = await sendSignalOutbound({
        cfg,
        to,
        text,
        mediaUrl,
        mediaLocalRoots,
        accountId: accountId ?? undefined,
        deps,
      });
      return { channel: "signal", ...result };
    },
  },
  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
    collectStatusIssues: (accounts) => collectStatusIssuesFromLastError("signal", accounts),
    buildChannelSummary: ({ snapshot }) => ({
      ...buildBaseChannelStatusSummary(snapshot),
      baseUrl: snapshot.baseUrl ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => {
      const baseUrl = account.baseUrl;
      return await getSignalRuntime().channel.signal.probeSignal(baseUrl, timeoutMs);
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      ...buildBaseAccountStatusSnapshot({ account, runtime, probe }),
      baseUrl: account.baseUrl,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        baseUrl: account.baseUrl,
      });
      ctx.log?.info(`[${account.accountId}] starting provider (${account.baseUrl})`);
      // Lazy import: the monitor pulls the reply pipeline; avoid ESM init cycles.
      return getSignalRuntime().channel.signal.monitorSignalProvider({
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        mediaMaxMb: account.config.mediaMaxMb,
      });
    },
  },
};
