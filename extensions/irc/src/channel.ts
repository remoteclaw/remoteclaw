import { formatNormalizedAllowFromEntries } from "remoteclaw/plugin-sdk/allow-from";
import {
  adaptScopedAccountAccessor,
  createScopedChannelConfigAdapter,
  createScopedDmSecurityResolver,
} from "remoteclaw/plugin-sdk/channel-config-helpers";
import {
  buildOpenGroupPolicyWarning,
  collectAllowlistProviderGroupPolicyWarnings,
} from "remoteclaw/plugin-sdk/channel-policy";
import {
  createChannelDirectoryAdapter,
  listResolvedDirectoryEntriesFromSources,
} from "remoteclaw/plugin-sdk/directory-runtime";
import { runStoppablePassiveMonitor } from "remoteclaw/plugin-sdk/extension-shared";
import { createDefaultChannelRuntimeState } from "remoteclaw/plugin-sdk/status-helpers";
import {
  listIrcAccountIds,
  resolveDefaultIrcAccountId,
  resolveIrcAccount,
  type ResolvedIrcAccount,
} from "./accounts.js";
import { IrcConfigSchema } from "./config-schema.js";
import { monitorIrcProvider } from "./monitor.js";
import {
  normalizeIrcMessagingTarget,
  looksLikeIrcTargetId,
  isChannelTarget,
  normalizeIrcAllowEntry,
} from "./normalize.js";
import { ircOnboardingAdapter } from "./onboarding.js";
import { resolveIrcGroupMatch, resolveIrcRequireMention } from "./policy.js";
import { probeIrc } from "./probe.js";
import { getIrcRuntime } from "./runtime.js";
import { sendMessageIrc } from "./send.js";
import type { CoreConfig, IrcProbe } from "./types.js";

const meta = getChatChannelMeta("irc");

function normalizePairingTarget(raw: string): string {
  const normalized = normalizeIrcAllowEntry(raw);
  if (!normalized) {
    return "";
  }
  return normalized.split(/[!@]/, 1)[0]?.trim() ?? "";
}

const ircConfigAdapter = createScopedChannelConfigAdapter<
  ResolvedIrcAccount,
  ResolvedIrcAccount,
  CoreConfig
>({
  sectionKey: "irc",
  listAccountIds: listIrcAccountIds,
  resolveAccount: adaptScopedAccountAccessor(resolveIrcAccount),
  defaultAccountId: resolveDefaultIrcAccountId,
  clearBaseFields: [
    "name",
    "host",
    "port",
    "tls",
    "nick",
    "username",
    "realname",
    "password",
    "passwordFile",
    "channels",
  ],
  resolveAllowFrom: (account: ResolvedIrcAccount) => account.config.allowFrom,
  formatAllowFrom: (allowFrom) =>
    formatNormalizedAllowFromEntries({
      allowFrom,
      normalizeEntry: normalizeIrcAllowEntry,
    }),
  resolveDefaultTo: (account: ResolvedIrcAccount) => account.config.defaultTo,
});

const ircConfigBase = createScopedChannelConfigBase<ResolvedIrcAccount, CoreConfig>({
  sectionKey: "irc",
  listAccountIds: listIrcAccountIds,
  resolveAccount: (cfg, accountId) => resolveIrcAccount({ cfg, accountId }),
  defaultAccountId: resolveDefaultIrcAccountId,
  clearBaseFields: [
    "name",
    "host",
    "port",
    "tls",
    "nick",
    "username",
    "realname",
    "password",
    "passwordFile",
    "channels",
  ],
});

const resolveIrcDmPolicy = createScopedDmSecurityResolver<ResolvedIrcAccount>({
  channelKey: "irc",
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  policyPathSuffix: "dmPolicy",
  normalizeEntry: (raw) => normalizeIrcAllowEntry(raw),
});

export const ircPlugin: ChannelPlugin<ResolvedIrcAccount, IrcProbe> = {
  id: "irc",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  setup: ircSetupAdapter,
  setupWizard: ircSetupWizard,
  pairing: createTextPairingAdapter({
    idLabel: "ircUser",
    message: PAIRING_APPROVED_MESSAGE,
    normalizeAllowEntry: (entry) => normalizeIrcAllowEntry(entry),
    notify: async ({ id, message }) => {
      const target = normalizePairingTarget(id);
      if (!target) {
        throw new Error(`invalid IRC pairing id: ${id}`);
      }
      await sendMessageIrc(target, message);
    },
  }),
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.irc"] },
  configSchema: buildChannelConfigSchema(IrcConfigSchema),
  config: {
    ...ircConfigBase,
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      host: account.host,
      port: account.port,
      tls: account.tls,
      nick: account.nick,
      passwordSource: account.passwordSource,
    }),
  },
  security: {
    resolveDmPolicy: resolveIrcDmPolicy,
    collectWarnings: ({ account, cfg }) => {
      const warnings = collectAllowlistProviderGroupPolicyWarnings({
        cfg,
        providerConfigPresent: cfg.channels?.irc !== undefined,
        configuredGroupPolicy: account.config.groupPolicy,
        collect: (groupPolicy) =>
          groupPolicy === "open"
            ? [
                buildOpenGroupPolicyWarning({
                  surface: "IRC channels",
                  openBehavior: "allows all channels and senders (mention-gated)",
                  remediation:
                    'Prefer channels.irc.groupPolicy="allowlist" with channels.irc.groups',
                }),
              ]
            : [],
      });
      if (!account.config.tls) {
        warnings.push(
          "- IRC TLS is disabled (channels.irc.tls=false); traffic and credentials are plaintext.",
        );
      }
      if (account.config.nickserv?.register) {
        warnings.push(
          '- IRC NickServ registration is enabled (channels.irc.nickserv.register=true); this sends "REGISTER" on every connect. Disable after first successful registration.',
        );
        if (!account.config.nickserv.password?.trim()) {
          warnings.push(
            "- IRC NickServ registration is enabled but no NickServ password is resolved; set channels.irc.nickserv.password, channels.irc.nickserv.passwordFile, or IRC_NICKSERV_PASSWORD.",
          );
        }
      }
      return warnings;
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId, groupId }) => {
      const account = resolveIrcAccount({ cfg: cfg as CoreConfig, accountId });
      if (!groupId) {
        return true;
      }
      const match = resolveIrcGroupMatch({ groups: account.config.groups, target: groupId });
      return resolveIrcRequireMention({
        groupConfig: match.groupConfig,
        wildcardConfig: match.wildcardConfig,
      });
    },
    resolveToolPolicy: ({ cfg, accountId, groupId }) => {
      const account = resolveIrcAccount({ cfg: cfg as CoreConfig, accountId });
      if (!groupId) {
        return undefined;
      }
      const match = resolveIrcGroupMatch({ groups: account.config.groups, target: groupId });
      return match.groupConfig?.tools ?? match.wildcardConfig?.tools;
    },
  },
  messaging: {
    normalizeTarget: normalizeIrcMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeIrcTargetId,
      hint: "<#channel|nick>",
    },
  },
  resolver: {
    resolveTargets: async ({ inputs, kind }) => {
      return inputs.map((input) => {
        const normalized = normalizeIrcMessagingTarget(input);
        if (!normalized) {
          return {
            input,
            resolved: false,
            note: "invalid IRC target",
          };
        }
        if (kind === "group") {
          const groupId = isChannelTarget(normalized) ? normalized : `#${normalized}`;
          return {
            input,
            resolved: true,
            id: groupId,
            name: groupId,
          };
        });
      },
    },
    directory: createChannelDirectoryAdapter({
      listPeers: async (params) =>
        listResolvedDirectoryEntriesFromSources<ResolvedIrcAccount>({
          ...params,
          kind: "user",
          resolveAccount: adaptScopedAccountAccessor(resolveIrcAccount),
          resolveSources: (account) => [
            account.config.allowFrom ?? [],
            account.config.groupAllowFrom ?? [],
            ...Object.values(account.config.groups ?? {}).map((group) => group.allowFrom ?? []),
          ],
          normalizeId: (entry) => normalizePairingTarget(entry) || null,
        }),
      listGroups: async (params) => {
        const entries = listResolvedDirectoryEntriesFromSources<ResolvedIrcAccount>({
          ...params,
          kind: "group",
          resolveAccount: adaptScopedAccountAccessor(resolveIrcAccount),
          resolveSources: (account) => [
            account.config.channels ?? [],
            Object.keys(account.config.groups ?? {}),
          ],
          normalizeId: (entry) => {
            const normalized = normalizeIrcMessagingTarget(entry);
            return normalized && isChannelTarget(normalized) ? normalized : null;
          },
        });
        return entries.map((entry) => ({ ...entry, name: entry.id }));
      },
    }),
    status: {
      defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
      buildChannelSummary: ({ account, snapshot }) => ({
        ...buildBaseChannelStatusSummary(snapshot),
        host: account.host,
        port: snapshot.port,
        tls: account.tls,
        nick: account.nick,
        probe: snapshot.probe,
        lastProbeAt: snapshot.lastProbeAt ?? null,
      }),
      probeAccount: async ({ cfg, account, timeoutMs }) =>
        probeIrc(cfg as CoreConfig, { accountId: account.accountId, timeoutMs }),
      buildAccountSnapshot: ({ account, runtime, probe }) =>
        buildBaseAccountStatusSnapshot(
          { account, runtime, probe },
          {
            host: account.host,
            port: account.port,
            tls: account.tls,
            nick: account.nick,
            passwordSource: account.passwordSource,
          },
        ),
    },
    gateway: {
      startAccount: async (ctx) => {
        const account = ctx.account;
        const statusSink = createAccountStatusSink({
          accountId: ctx.accountId,
          setStatus: ctx.setStatus,
        });
        if (!account.configured) {
          throw new Error(
            `IRC is not configured for account "${account.accountId}" (need host and nick in channels.irc).`,
          );
        }
        if (isChannelTarget(normalized)) {
          return {
            input,
            resolved: false,
            note: "expected user target",
          };
        }
        return {
          input,
          resolved: true,
          id: normalized,
          name: normalized,
        };
      });
    },
  },
  directory: createChannelDirectoryAdapter({
    listPeers: async (params) =>
      listResolvedDirectoryEntriesFromSources<ResolvedIrcAccount>({
        ...params,
        kind: "user",
        resolveAccount: adaptScopedAccountAccessor(resolveIrcAccount),
        resolveSources: (account) => [
          account.config.allowFrom ?? [],
          account.config.groupAllowFrom ?? [],
          ...Object.values(account.config.groups ?? {}).map((group) => group.allowFrom ?? []),
        ],
        normalizeId: (entry) => normalizePairingTarget(entry) || null,
      }),
    listGroups: async (params) => {
      const entries = listResolvedDirectoryEntriesFromSources<ResolvedIrcAccount>({
        ...params,
        kind: "group",
        resolveAccount: adaptScopedAccountAccessor(resolveIrcAccount),
        resolveSources: (account) => [
          account.config.channels ?? [],
          Object.keys(account.config.groups ?? {}),
        ],
        normalizeId: (entry) => {
          const normalized = normalizeIrcMessagingTarget(entry);
          return normalized && isChannelTarget(normalized) ? normalized : null;
        },
      });
      return entries.map((entry) => ({ ...entry, name: entry.id }));
    },
  }),
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getIrcRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 350,
    ...createAttachedChannelResultAdapter({
      channel: "irc",
      sendText: async ({ cfg, to, text, accountId, replyToId }) =>
        await sendMessageIrc(to, text, {
          cfg: cfg as CoreConfig,
          accountId: accountId ?? undefined,
          replyTo: replyToId ?? undefined,
        }),
      sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId }) =>
        await sendMessageIrc(to, mediaUrl ? `${text}\n\nAttachment: ${mediaUrl}` : text, {
          cfg: cfg as CoreConfig,
          accountId: accountId ?? undefined,
          replyTo: replyToId ?? undefined,
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
    buildChannelSummary: ({ account, snapshot }) => ({
      ...buildBaseChannelStatusSummary(snapshot),
      host: account.host,
      port: snapshot.port,
      tls: account.tls,
      nick: account.nick,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ cfg, account, timeoutMs }) =>
      probeIrc(cfg as CoreConfig, { accountId: account.accountId, timeoutMs }),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      ...buildBaseAccountStatusSnapshot({ account, runtime, probe }),
      host: account.host,
      port: account.port,
      tls: account.tls,
      nick: account.nick,
      passwordSource: account.passwordSource,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.configured) {
        throw new Error(
          `IRC is not configured for account "${account.accountId}" (need host and nick in channels.irc).`,
        );
      }
      ctx.log?.info(
        `[${account.accountId}] starting IRC provider (${account.host}:${account.port}${account.tls ? " tls" : ""})`,
      );
      const { stop } = await monitorIrcProvider({
        accountId: account.accountId,
        config: ctx.cfg as CoreConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
      return { stop };
    },
  },
};
