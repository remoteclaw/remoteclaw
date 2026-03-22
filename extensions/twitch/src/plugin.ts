/**
 * Twitch channel plugin for RemoteClaw.
 *
 * Main plugin export combining all adapters (outbound, actions, status, gateway).
 * This is the primary entry point for the Twitch channel integration.
 */

<<<<<<< HEAD
import type { RemoteClawConfig } from "remoteclaw/plugin-sdk";
import { buildChannelConfigSchema } from "remoteclaw/plugin-sdk";
||||||| parent of ec232aca39 (refactor: adopt chat plugin builder in twitch)
import {
  createLoggedPairingApprovalNotifier,
  createPairingPrefixStripper,
} from "openclaw/plugin-sdk/channel-pairing";
import { buildPassiveProbedChannelStatusSummary } from "openclaw/plugin-sdk/extension-shared";
import type { OpenClawConfig } from "../api.js";
import { buildChannelConfigSchema } from "../api.js";
=======
import { describeAccountSnapshot } from "openclaw/plugin-sdk/account-helpers";
import {
  createLoggedPairingApprovalNotifier,
  createPairingPrefixStripper,
} from "openclaw/plugin-sdk/channel-pairing";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import { buildPassiveProbedChannelStatusSummary } from "openclaw/plugin-sdk/extension-shared";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import type { OpenClawConfig } from "../api.js";
import { buildChannelConfigSchema } from "../api.js";
>>>>>>> ec232aca39 (refactor: adopt chat plugin builder in twitch)
import { twitchMessageActions } from "./actions.js";
import { removeClientManager } from "./client-manager-registry.js";
import { TwitchConfigSchema } from "./config-schema.js";
import { DEFAULT_ACCOUNT_ID, getAccountConfig, listAccountIds } from "./config.js";
import { twitchOnboardingAdapter } from "./onboarding.js";
import { twitchOutbound } from "./outbound.js";
import { probeTwitch } from "./probe.js";
import { resolveTwitchTargets } from "./resolver.js";
import { collectTwitchStatusIssues } from "./status.js";
import { resolveTwitchToken } from "./token.js";
import type {
  ChannelLogSink,
  ChannelPlugin,
  ChannelResolveKind,
  ChannelResolveResult,
  TwitchAccountConfig,
} from "./types.js";
import { isAccountConfigured } from "./utils/twitch.js";

type ResolvedTwitchAccount = TwitchAccountConfig & { accountId?: string | null };

/**
 * Twitch channel plugin.
 *
 * Implements the ChannelPlugin interface to provide Twitch chat integration
 * for RemoteClaw. Supports message sending, receiving, access control, and
 * status monitoring.
 */
<<<<<<< HEAD
export const twitchPlugin: ChannelPlugin<TwitchAccountConfig> = {
  /** Plugin identifier */
  id: "twitch",

  /** Plugin metadata */
  meta: {
    id: "twitch",
    label: "Twitch",
    selectionLabel: "Twitch (Chat)",
    docsPath: "/channels/twitch",
    blurb: "Twitch chat integration",
    aliases: ["twitch-chat"],
  } satisfies ChannelMeta,

  /** Onboarding adapter */
  onboarding: twitchOnboardingAdapter,

  /** Pairing configuration */
  pairing: {
    idLabel: "twitchUserId",
    normalizeAllowEntry: (entry) => entry.trim().replace(/^(twitch:)?user:?/i, ""),
    notifyApproval: async ({ id }) => {
      // Note: Twitch doesn't support DMs from bots, so pairing approval is limited
      // We'll log the approval instead
      console.warn(`Pairing approved for user ${id} (notification sent via chat if possible)`);
    },
  },

  /** Supported chat capabilities */
  capabilities: {
    chatTypes: ["group"],
  } satisfies ChannelCapabilities,

  /** Configuration schema for Twitch channel */
  configSchema: buildChannelConfigSchema(TwitchConfigSchema),

  /** Account configuration management */
  config: {
    /** List all configured account IDs */
    listAccountIds: (cfg: RemoteClawConfig): string[] => listAccountIds(cfg),

    /** Resolve an account config by ID */
    resolveAccount: (cfg: RemoteClawConfig, accountId?: string | null): TwitchAccountConfig => {
      const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID);
      if (!account) {
        // Return a default/empty account if not configured
        return {
          username: "",
          accessToken: "",
          clientId: "",
          enabled: false,
        } as TwitchAccountConfig;
      }
      return account;
||||||| parent of ec232aca39 (refactor: adopt chat plugin builder in twitch)
export const twitchPlugin: ChannelPlugin<TwitchAccountConfig> = {
  /** Plugin identifier */
  id: "twitch",

  /** Plugin metadata */
  meta: {
    id: "twitch",
    label: "Twitch",
    selectionLabel: "Twitch (Chat)",
    docsPath: "/channels/twitch",
    blurb: "Twitch chat integration",
    aliases: ["twitch-chat"],
  } satisfies ChannelMeta,

  /** Setup wizard surface */
  setup: twitchSetupAdapter,
  setupWizard: twitchSetupWizard,

  /** Pairing configuration */
  pairing: {
    idLabel: "twitchUserId",
    normalizeAllowEntry: createPairingPrefixStripper(/^(twitch:)?user:?/i),
    notifyApproval: createLoggedPairingApprovalNotifier(
      ({ id }) => `Pairing approved for user ${id} (notification sent via chat if possible)`,
      console.warn,
    ),
  },

  /** Supported chat capabilities */
  capabilities: {
    chatTypes: ["group"],
  } satisfies ChannelCapabilities,

  /** Configuration schema for Twitch channel */
  configSchema: buildChannelConfigSchema(TwitchConfigSchema),

  /** Account configuration management */
  config: {
    /** List all configured account IDs */
    listAccountIds: (cfg: OpenClawConfig): string[] => listAccountIds(cfg),

    /** Resolve an account config by ID */
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null): TwitchAccountConfig => {
      const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID);
      if (!account) {
        // Return a default/empty account if not configured
        return {
          username: "",
          accessToken: "",
          clientId: "",
          enabled: false,
        } as TwitchAccountConfig;
      }
      return account;
=======
export const twitchPlugin: ChannelPlugin<ResolvedTwitchAccount> =
  createChatChannelPlugin<ResolvedTwitchAccount>({
    pairing: {
      idLabel: "twitchUserId",
      normalizeAllowEntry: createPairingPrefixStripper(/^(twitch:)?user:?/i),
      notifyApproval: createLoggedPairingApprovalNotifier(
        ({ id }) => `Pairing approved for user ${id} (notification sent via chat if possible)`,
        console.warn,
      ),
>>>>>>> ec232aca39 (refactor: adopt chat plugin builder in twitch)
    },
    outbound: twitchOutbound,
    base: {
      id: "twitch",
      meta: {
        id: "twitch",
        label: "Twitch",
        selectionLabel: "Twitch (Chat)",
        docsPath: "/channels/twitch",
        blurb: "Twitch chat integration",
        aliases: ["twitch-chat"],
      },
      setup: twitchSetupAdapter,
      setupWizard: twitchSetupWizard,
      capabilities: {
        chatTypes: ["group"],
      },
      configSchema: buildChannelConfigSchema(TwitchConfigSchema),
      config: {
        listAccountIds: (cfg: OpenClawConfig): string[] => listAccountIds(cfg),
        resolveAccount: (cfg: OpenClawConfig, accountId?: string | null): ResolvedTwitchAccount => {
          const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
          const account = getAccountConfig(cfg, resolvedAccountId);
          if (!account) {
            return {
              accountId: resolvedAccountId,
              channel: "",
              username: "",
              accessToken: "",
              clientId: "",
              enabled: false,
            };
          }
          return {
            accountId: resolvedAccountId,
            ...account,
          };
        },
        defaultAccountId: (): string => DEFAULT_ACCOUNT_ID,
        isConfigured: (_account: unknown, cfg: OpenClawConfig): boolean =>
          resolveTwitchAccountContext(cfg, DEFAULT_ACCOUNT_ID).configured,
        isEnabled: (account: ResolvedTwitchAccount | undefined): boolean =>
          account?.enabled !== false,
        describeAccount: (account: TwitchAccountConfig | undefined) =>
          account
            ? describeAccountSnapshot({
                account,
                configured: isAccountConfigured(account, account.accessToken),
              })
            : {
                accountId: DEFAULT_ACCOUNT_ID,
                enabled: false,
                configured: false,
              },
      },
      actions: twitchMessageActions,
      resolver: {
        resolveTargets: async ({
          cfg,
          accountId,
          inputs,
          kind,
          runtime,
        }: {
          cfg: OpenClawConfig;
          accountId?: string | null;
          inputs: string[];
          kind: ChannelResolveKind;
          runtime: import("openclaw/plugin-sdk/runtime-env").RuntimeEnv;
        }): Promise<ChannelResolveResult[]> => {
          const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID);
          if (!account) {
            return inputs.map((input) => ({
              input,
              resolved: false,
              note: "account not configured",
            }));
          }

          const log: ChannelLogSink = {
            info: (msg) => runtime.log(msg),
            warn: (msg) => runtime.log(msg),
            error: (msg) => runtime.error(msg),
            debug: (msg) => runtime.log(msg),
          };
          return await resolveTwitchTargets(inputs, account, kind, log);
        },
      },
      status: createComputedAccountStatusAdapter<ResolvedTwitchAccount>({
        defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
        buildChannelSummary: ({ snapshot }) => buildPassiveProbedChannelStatusSummary(snapshot),
        probeAccount: async ({ account, timeoutMs }) => await probeTwitch(account, timeoutMs),
        collectStatusIssues: collectTwitchStatusIssues,
        resolveAccountSnapshot: ({ account, cfg }) => {
          const resolvedAccountId =
            account.accountId || resolveTwitchSnapshotAccountId(cfg, account);
          const { configured } = resolveTwitchAccountContext(cfg, resolvedAccountId);
          return {
            accountId: resolvedAccountId,
            enabled: account.enabled !== false,
            configured,
          };
        },
      }),
      gateway: {
        startAccount: async (ctx): Promise<void> => {
          const account = ctx.account;
          const accountId = ctx.accountId;

<<<<<<< HEAD
    /** Check if an account is configured */
    isConfigured: (_account: unknown, cfg: RemoteClawConfig): boolean => {
      const account = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);
      const tokenResolution = resolveTwitchToken(cfg, { accountId: DEFAULT_ACCOUNT_ID });
      return account ? isAccountConfigured(account, tokenResolution.token) : false;
||||||| parent of ec232aca39 (refactor: adopt chat plugin builder in twitch)
    /** Check if an account is configured */
    isConfigured: (_account: unknown, cfg: OpenClawConfig): boolean => {
      return resolveTwitchAccountContext(cfg, DEFAULT_ACCOUNT_ID).configured;
=======
          ctx.setStatus?.({
            accountId,
            running: true,
            lastStartAt: Date.now(),
            lastError: null,
          });

          ctx.log?.info(`Starting Twitch connection for ${account.username}`);

          // Lazy import: the monitor pulls the reply pipeline; avoid ESM init cycles.
          const { monitorTwitchProvider } = await import("./monitor.js");
          await monitorTwitchProvider({
            account,
            accountId,
            config: ctx.cfg,
            runtime: ctx.runtime,
            abortSignal: ctx.abortSignal,
          });
        },
        stopAccount: async (ctx): Promise<void> => {
          const account = ctx.account;
          const accountId = ctx.accountId;

          await removeClientManager(accountId);

          ctx.setStatus?.({
            accountId,
            running: false,
            lastStopAt: Date.now(),
          });

          ctx.log?.info(`Stopped Twitch connection for ${account.username}`);
        },
      },
>>>>>>> ec232aca39 (refactor: adopt chat plugin builder in twitch)
    },
<<<<<<< HEAD

    /** Check if an account is enabled */
    isEnabled: (account: TwitchAccountConfig | undefined): boolean => account?.enabled !== false,

    /** Describe account status */
    describeAccount: (account: TwitchAccountConfig | undefined) => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: account ? isAccountConfigured(account, account?.accessToken) : false,
      };
    },
  },

  /** Outbound message adapter */
  outbound: twitchOutbound,

  /** Message actions adapter */
  actions: twitchMessageActions,

  /** Resolver adapter for username -> user ID resolution */
  resolver: {
    resolveTargets: async ({
      cfg,
      accountId,
      inputs,
      kind,
      runtime,
    }: {
      cfg: RemoteClawConfig;
      accountId?: string | null;
      inputs: string[];
      kind: ChannelResolveKind;
      runtime: import("../../../src/runtime.js").RuntimeEnv;
    }): Promise<ChannelResolveResult[]> => {
      const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID);

      if (!account) {
        return inputs.map((input) => ({
          input,
          resolved: false,
          note: "account not configured",
        }));
      }

      // Adapt RuntimeEnv.log to ChannelLogSink
      const log: ChannelLogSink = {
        info: (msg) => runtime.log(msg),
        warn: (msg) => runtime.log(msg),
        error: (msg) => runtime.error(msg),
        debug: (msg) => runtime.log(msg),
      };
      return await resolveTwitchTargets(inputs, account, kind, log);
    },
  },

  /** Status monitoring adapter */
  status: {
    /** Default runtime state */
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    /** Build channel summary from snapshot */
    buildChannelSummary: ({ snapshot }: { snapshot: ChannelAccountSnapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),

    /** Probe account connection */
    probeAccount: async ({
      account,
      timeoutMs,
    }: {
      account: TwitchAccountConfig;
      timeoutMs: number;
    }): Promise<unknown> => {
      return await probeTwitch(account, timeoutMs);
    },

    /** Build account snapshot with current status */
    buildAccountSnapshot: ({
      account,
      cfg,
      runtime,
      probe,
    }: {
      account: TwitchAccountConfig;
      cfg: RemoteClawConfig;
      runtime?: ChannelAccountSnapshot;
      probe?: unknown;
    }): ChannelAccountSnapshot => {
      const twitch = (cfg as Record<string, unknown>).channels as
        | Record<string, unknown>
        | undefined;
      const twitchCfg = twitch?.twitch as Record<string, unknown> | undefined;
      const accountMap = (twitchCfg?.accounts as Record<string, unknown> | undefined) ?? {};
      const resolvedAccountId =
        Object.entries(accountMap).find(([, value]) => value === account)?.[0] ??
        DEFAULT_ACCOUNT_ID;
      const tokenResolution = resolveTwitchToken(cfg, { accountId: resolvedAccountId });
      return {
        accountId: resolvedAccountId,
        enabled: account?.enabled !== false,
        configured: isAccountConfigured(account, tokenResolution.token),
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      };
    },

    /** Collect status issues for all accounts */
    collectStatusIssues: collectTwitchStatusIssues,
  },

  /** Gateway adapter for connection lifecycle */
  gateway: {
    /** Start an account connection */
    startAccount: async (ctx): Promise<void> => {
      const account = ctx.account;
      const accountId = ctx.accountId;

      ctx.setStatus?.({
        accountId,
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });

      ctx.log?.info(`Starting Twitch connection for ${account.username}`);

      // Lazy import: the monitor pulls the reply pipeline; avoid ESM init cycles.
      const { monitorTwitchProvider } = await import("./monitor.js");
      await monitorTwitchProvider({
        account,
        accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
      });
    },

    /** Stop an account connection */
    stopAccount: async (ctx): Promise<void> => {
      const account = ctx.account;
      const accountId = ctx.accountId;

      // Disconnect and remove client manager from registry
      await removeClientManager(accountId);

      ctx.setStatus?.({
        accountId,
        running: false,
        lastStopAt: Date.now(),
      });

      ctx.log?.info(`Stopped Twitch connection for ${account.username}`);
    },
  },
};
||||||| parent of ec232aca39 (refactor: adopt chat plugin builder in twitch)

    /** Check if an account is enabled */
    isEnabled: (account: TwitchAccountConfig | undefined): boolean => account?.enabled !== false,

    /** Describe account status */
    describeAccount: (account: TwitchAccountConfig | undefined) => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: account ? isAccountConfigured(account, account?.accessToken) : false,
      };
    },
  },

  /** Outbound message adapter */
  outbound: twitchOutbound,

  /** Message actions adapter */
  actions: twitchMessageActions,

  /** Resolver adapter for username -> user ID resolution */
  resolver: {
    resolveTargets: async ({
      cfg,
      accountId,
      inputs,
      kind,
      runtime,
    }: {
      cfg: OpenClawConfig;
      accountId?: string | null;
      inputs: string[];
      kind: ChannelResolveKind;
      runtime: import("openclaw/plugin-sdk/runtime-env").RuntimeEnv;
    }): Promise<ChannelResolveResult[]> => {
      const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID);

      if (!account) {
        return inputs.map((input) => ({
          input,
          resolved: false,
          note: "account not configured",
        }));
      }

      // Adapt RuntimeEnv.log to ChannelLogSink
      const log: ChannelLogSink = {
        info: (msg) => runtime.log(msg),
        warn: (msg) => runtime.log(msg),
        error: (msg) => runtime.error(msg),
        debug: (msg) => runtime.log(msg),
      };
      return await resolveTwitchTargets(inputs, account, kind, log);
    },
  },

  /** Status monitoring adapter */
  status: {
    /** Default runtime state */
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    /** Build channel summary from snapshot */
    buildChannelSummary: ({ snapshot }: { snapshot: ChannelAccountSnapshot }) =>
      buildPassiveProbedChannelStatusSummary(snapshot),

    /** Probe account connection */
    probeAccount: async ({
      account,
      timeoutMs,
    }: {
      account: TwitchAccountConfig;
      timeoutMs: number;
    }): Promise<unknown> => {
      return await probeTwitch(account, timeoutMs);
    },

    /** Build account snapshot with current status */
    buildAccountSnapshot: ({
      account,
      cfg,
      runtime,
      probe,
    }: {
      account: TwitchAccountConfig;
      cfg: OpenClawConfig;
      runtime?: ChannelAccountSnapshot;
      probe?: unknown;
    }): ChannelAccountSnapshot => {
      const resolvedAccountId = resolveTwitchSnapshotAccountId(cfg, account);
      const { configured } = resolveTwitchAccountContext(cfg, resolvedAccountId);
      return {
        accountId: resolvedAccountId,
        enabled: account?.enabled !== false,
        configured,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      };
    },

    /** Collect status issues for all accounts */
    collectStatusIssues: collectTwitchStatusIssues,
  },

  /** Gateway adapter for connection lifecycle */
  gateway: {
    /** Start an account connection */
    startAccount: async (ctx): Promise<void> => {
      const account = ctx.account;
      const accountId = ctx.accountId;

      ctx.setStatus?.({
        accountId,
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });

      ctx.log?.info(`Starting Twitch connection for ${account.username}`);

      // Lazy import: the monitor pulls the reply pipeline; avoid ESM init cycles.
      const { monitorTwitchProvider } = await import("./monitor.js");
      await monitorTwitchProvider({
        account,
        accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
      });
    },

    /** Stop an account connection */
    stopAccount: async (ctx): Promise<void> => {
      const account = ctx.account;
      const accountId = ctx.accountId;

      // Disconnect and remove client manager from registry
      await removeClientManager(accountId);

      ctx.setStatus?.({
        accountId,
        running: false,
        lastStopAt: Date.now(),
      });

      ctx.log?.info(`Stopped Twitch connection for ${account.username}`);
    },
  },
};
=======
  });
>>>>>>> ec232aca39 (refactor: adopt chat plugin builder in twitch)
