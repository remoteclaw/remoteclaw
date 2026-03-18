import { buildDmGroupAccountAllowlistAdapter } from "remoteclaw/plugin-sdk/allowlist-config-edit";
import {
  attachChannelToResult,
  createAttachedChannelResultAdapter,
  createPairingPrefixStripper,
  createTextPairingAdapter,
  resolveOutboundSendDep,
} from "remoteclaw/plugin-sdk/channel-runtime";
import { attachChannelToResults } from "remoteclaw/plugin-sdk/channel-send-result";
import { resolveMarkdownTableMode } from "remoteclaw/plugin-sdk/config-runtime";
import { buildOutboundBaseSessionKey } from "remoteclaw/plugin-sdk/core";
import { resolveTextChunkLimit } from "remoteclaw/plugin-sdk/reply-runtime";
import { type RoutePeer } from "remoteclaw/plugin-sdk/routing";
import { resolveSignalAccount, type ResolvedSignalAccount } from "./accounts.js";
import { markdownToSignalTextChunks } from "./format.js";
import {
  collectAllowlistProviderRestrictSendersWarnings,
  createScopedDmSecurityResolver,
} from "remoteclaw/plugin-sdk/channel-config-helpers";
import { resolveOutboundSendDep } from "remoteclaw/plugin-sdk/channel-runtime";
import { resolveMarkdownTableMode } from "remoteclaw/plugin-sdk/config-runtime";
import { buildOutboundBaseSessionKey } from "remoteclaw/plugin-sdk/core";
import { resolveTextChunkLimit } from "remoteclaw/plugin-sdk/reply-runtime";
import { type RoutePeer } from "remoteclaw/plugin-sdk/routing";
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
import { createSignalPluginBase, signalConfigAccessors, signalSetupWizard } from "./shared.js";

const resolveSignalDmPolicy = createScopedDmSecurityResolver<ResolvedSignalAccount>({
  channelKey: "signal",
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  policyPathSuffix: "dmPolicy",
  normalizeEntry: (raw) => normalizeE164(raw.replace(/^signal:/i, "").trim()),
});
type SignalSendFn = ReturnType<typeof getSignalRuntime>["channel"]["signal"]["sendMessageSignal"];

const signalMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: (ctx) =>
    getSignalRuntime().channel.signal.messageActions?.describeMessageTool?.(ctx) ?? null,
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

function inferSignalTargetChatType(rawTo: string) {
  let to = rawTo.trim();
  if (!to) {
    return undefined;
  }
  if (/^signal:/i.test(to)) {
    to = to.replace(/^signal:/i, "").trim();
  }
  if (!to) {
    return undefined;
  }
  const lower = to.toLowerCase();
  if (lower.startsWith("group:")) {
    return "group" as const;
  }
  if (lower.startsWith("username:") || lower.startsWith("u:")) {
    return "direct" as const;
  }
  return "direct" as const;
}

function parseSignalExplicitTarget(raw: string) {
  const normalized = normalizeSignalMessagingTarget(raw);
  if (!normalized) {
    return null;
  }
  return {
    to: normalized,
    chatType: inferSignalTargetChatType(normalized),
  };
}

function buildSignalBaseSessionKey(params: {
  cfg: Parameters<typeof resolveSignalAccount>[0]["cfg"];
  agentId: string;
  accountId?: string | null;
  peer: RoutePeer;
}) {
  return buildOutboundBaseSessionKey({ ...params, channel: "signal" });
}

function resolveSignalOutboundSessionRoute(params: {
  cfg: Parameters<typeof resolveSignalAccount>[0]["cfg"];
  agentId: string;
  accountId?: string | null;
  target: string;
}) {
  const stripped = params.target.replace(/^signal:/i, "").trim();
  const lowered = stripped.toLowerCase();
  if (lowered.startsWith("group:")) {
    const groupId = stripped.slice("group:".length).trim();
    if (!groupId) {
      return null;
    }
    const peer: RoutePeer = { kind: "group", id: groupId };
    const baseSessionKey = buildSignalBaseSessionKey({
      cfg: params.cfg,
      agentId: params.agentId,
      accountId: params.accountId,
      peer,
    });
    return {
      sessionKey: baseSessionKey,
      baseSessionKey,
      peer,
      chatType: "group" as const,
      from: `group:${groupId}`,
      to: `group:${groupId}`,
    };
  }

  let recipient = stripped.trim();
  if (lowered.startsWith("username:")) {
    recipient = stripped.slice("username:".length).trim();
  } else if (lowered.startsWith("u:")) {
    recipient = stripped.slice("u:".length).trim();
  }
  if (!recipient) {
    return null;
  }

  const uuidCandidate = recipient.toLowerCase().startsWith("uuid:")
    ? recipient.slice("uuid:".length)
    : recipient;
  const sender = resolveSignalSender({
    sourceUuid: looksLikeUuid(uuidCandidate) ? uuidCandidate : null,
    sourceNumber: looksLikeUuid(uuidCandidate) ? null : recipient,
  });
  const peerId = sender ? resolveSignalPeerId(sender) : recipient;
  const displayRecipient = sender ? resolveSignalRecipient(sender) : recipient;
  const peer: RoutePeer = { kind: "direct", id: peerId };
  const baseSessionKey = buildSignalBaseSessionKey({
    cfg: params.cfg,
    agentId: params.agentId,
    accountId: params.accountId,
    peer,
  });
  return {
    sessionKey: baseSessionKey,
    baseSessionKey,
    peer,
    chatType: "direct" as const,
    from: `signal:${displayRecipient}`,
    to: `signal:${displayRecipient}`,
  };
}

async function sendFormattedSignalText(ctx: {
  cfg: Parameters<typeof resolveSignalAccount>[0]["cfg"];
  to: string;
  text: string;
  accountId?: string | null;
  deps?: { [channelId: string]: unknown };
  abortSignal?: AbortSignal;
}) {
  const { send, maxBytes } = resolveSignalSendContext({
    cfg: ctx.cfg,
    accountId: ctx.accountId ?? undefined,
    deps: ctx.deps,
  });
  const limit = resolveTextChunkLimit(ctx.cfg, "signal", ctx.accountId ?? undefined, {
    fallbackLimit: 4000,
  });
  const tableMode = resolveMarkdownTableMode({
    cfg: ctx.cfg,
    channel: "signal",
    accountId: ctx.accountId ?? undefined,
  });
  let chunks =
    limit === undefined
      ? markdownToSignalTextChunks(ctx.text, Number.POSITIVE_INFINITY, { tableMode })
      : markdownToSignalTextChunks(ctx.text, limit, { tableMode });
  if (chunks.length === 0 && ctx.text) {
    chunks = [{ text: ctx.text, styles: [] }];
  }
  const results = [];
  for (const chunk of chunks) {
    ctx.abortSignal?.throwIfAborted();
    const result = await send(ctx.to, chunk.text, {
      cfg: ctx.cfg,
      maxBytes,
      accountId: ctx.accountId ?? undefined,
      textMode: "plain",
      textStyles: chunk.styles,
    });
    results.push(result);
  }
  return attachChannelToResults("signal", results);
}

async function sendFormattedSignalMedia(ctx: {
  cfg: Parameters<typeof resolveSignalAccount>[0]["cfg"];
  to: string;
  text: string;
  mediaUrl: string;
  mediaLocalRoots?: readonly string[];
  accountId?: string | null;
  deps?: { [channelId: string]: unknown };
  abortSignal?: AbortSignal;
}) {
  ctx.abortSignal?.throwIfAborted();
  const { send, maxBytes } = resolveSignalSendContext({
    cfg: ctx.cfg,
    accountId: ctx.accountId ?? undefined,
    deps: ctx.deps,
  });
  const tableMode = resolveMarkdownTableMode({
    cfg: ctx.cfg,
    channel: "signal",
    accountId: ctx.accountId ?? undefined,
  });
  const formatted = markdownToSignalTextChunks(ctx.text, Number.POSITIVE_INFINITY, {
    tableMode,
  })[0] ?? {
    text: ctx.text,
    styles: [],
  };
  const result = await send(ctx.to, formatted.text, {
    cfg: ctx.cfg,
    mediaUrl: ctx.mediaUrl,
    mediaLocalRoots: ctx.mediaLocalRoots,
    maxBytes,
    accountId: ctx.accountId ?? undefined,
    textMode: "plain",
    textStyles: formatted.styles,
  });
  return attachChannelToResult("signal", result);
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
    resolveDmPolicy: resolveSignalDmPolicy,
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
        deps,
        abortSignal,
      }),
    ...createAttachedChannelResultAdapter({
      channel: "signal",
      sendText: async ({ cfg, to, text, accountId, deps }) =>
        await sendSignalOutbound({
          cfg,
          to,
          text,
          accountId: accountId ?? undefined,
          deps,
        }),
      sendMedia: async ({ cfg, to, text, mediaUrl, mediaLocalRoots, accountId, deps }) =>
        await sendSignalOutbound({
          cfg,
          to,
          text,
          mediaUrl,
          mediaLocalRoots,
          accountId: accountId ?? undefined,
          deps,
        }),
    }),
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
