import { normalizeWhatsAppAllowFromEntries } from "../channels/plugins/normalize/whatsapp.js";
import type { ChannelConfigAdapter } from "../channels/plugins/types.adapters.js";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveIMessageAccount } from "../imessage/accounts.js";
import { normalizeAccountId } from "../routing/session-key.js";
import { normalizeStringEntries } from "../shared/string-normalization.js";
import { resolveWhatsAppAccount } from "../web/accounts.js";

export function mapAllowFromEntries(
  allowFrom: Array<string | number> | null | undefined,
): string[] {
  return (allowFrom ?? []).map((entry) => String(entry));
}

export function formatTrimmedAllowFromEntries(allowFrom: Array<string | number>): string[] {
  return normalizeStringEntries(allowFrom);
}

export function resolveOptionalConfigString(
  value: string | number | null | undefined,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
}

export function createScopedAccountConfigAccessors<ResolvedAccount>(params: {
  resolveAccount: (params: { cfg: RemoteClawConfig; accountId?: string | null }) => ResolvedAccount;
  resolveAllowFrom: (account: ResolvedAccount) => Array<string | number> | null | undefined;
  formatAllowFrom: (allowFrom: Array<string | number>) => string[];
  resolveDefaultTo?: (account: ResolvedAccount) => string | number | null | undefined;
}): Pick<
  ChannelConfigAdapter<ResolvedAccount>,
  "resolveAllowFrom" | "formatAllowFrom" | "resolveDefaultTo"
> {
  const base = {
    resolveAllowFrom: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId?: string | null }) =>
      mapAllowFromEntries(params.resolveAllowFrom(params.resolveAccount({ cfg, accountId }))),
    formatAllowFrom: ({ allowFrom }: { allowFrom: Array<string | number> }) =>
      params.formatAllowFrom(allowFrom),
  };

  if (!params.resolveDefaultTo) {
    return base;
  }

  return {
    ...base,
    resolveDefaultTo: ({ cfg, accountId }) =>
      resolveOptionalConfigString(
        params.resolveDefaultTo?.(params.resolveAccount({ cfg, accountId })),
      ),
  };
}

/** Build the common CRUD/config helpers for channels that store multiple named accounts. */
export function createScopedChannelConfigBase<
  ResolvedAccount,
  Config extends RemoteClawConfig = RemoteClawConfig,
>(params: {
  sectionKey: string;
  listAccountIds: (cfg: Config) => string[];
  resolveAccount: (cfg: Config, accountId?: string | null) => ResolvedAccount;
  defaultAccountId: (cfg: Config) => string;
  inspectAccount?: (cfg: Config, accountId?: string | null) => unknown;
  clearBaseFields: string[];
  allowTopLevel?: boolean;
}): Pick<
  ChannelConfigAdapter<ResolvedAccount>,
  | "listAccountIds"
  | "resolveAccount"
  | "inspectAccount"
  | "defaultAccountId"
  | "setAccountEnabled"
  | "deleteAccount"
> {
  return {
    listAccountIds: (cfg) => params.listAccountIds(cfg as Config),
    resolveAccount: (cfg, accountId) => params.resolveAccount(cfg as Config, accountId),
    inspectAccount: params.inspectAccount
      ? (cfg, accountId) => params.inspectAccount?.(cfg as Config, accountId)
      : undefined,
    defaultAccountId: (cfg) => params.defaultAccountId(cfg as Config),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as Config,
        sectionKey: params.sectionKey,
        accountId,
        enabled,
        allowTopLevel: params.allowTopLevel ?? true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as Config,
        sectionKey: params.sectionKey,
        accountId,
        clearBaseFields: params.clearBaseFields,
      }),
  };
}

/** Build the full shared config adapter for account-scoped channels with allowlist/default target accessors. */
export function createScopedChannelConfigAdapter<
  ResolvedAccount,
  AccessorAccount = ResolvedAccount,
  Config extends RemoteClawConfig = RemoteClawConfig,
>(params: {
  sectionKey: string;
  listAccountIds: (cfg: Config) => string[];
  resolveAccount: (cfg: Config, accountId?: string | null) => ResolvedAccount;
  resolveAccessorAccount?: (params: { cfg: Config; accountId?: string | null }) => AccessorAccount;
  defaultAccountId: (cfg: Config) => string;
  inspectAccount?: (cfg: Config, accountId?: string | null) => unknown;
  clearBaseFields: string[];
  allowTopLevel?: boolean;
  resolveAllowFrom: (account: AccessorAccount) => Array<string | number> | null | undefined;
  formatAllowFrom: (allowFrom: Array<string | number>) => string[];
  resolveDefaultTo?: (account: AccessorAccount) => string | number | null | undefined;
}): Pick<
  ChannelConfigAdapter<ResolvedAccount>,
  | "listAccountIds"
  | "resolveAccount"
  | "inspectAccount"
  | "defaultAccountId"
  | "setAccountEnabled"
  | "deleteAccount"
  | "resolveAllowFrom"
  | "formatAllowFrom"
  | "resolveDefaultTo"
> {
  const resolveAccessorAccount =
    params.resolveAccessorAccount ??
    (({ cfg, accountId }: { cfg: Config; accountId?: string | null }) =>
      params.resolveAccount(cfg, accountId) as unknown as AccessorAccount);

  return {
    ...createScopedChannelConfigBase<ResolvedAccount, Config>({
      sectionKey: params.sectionKey,
      listAccountIds: params.listAccountIds,
      resolveAccount: params.resolveAccount,
      inspectAccount: params.inspectAccount,
      defaultAccountId: params.defaultAccountId,
      clearBaseFields: params.clearBaseFields,
      allowTopLevel: params.allowTopLevel,
    }),
    ...createScopedAccountConfigAccessors<AccessorAccount>({
      resolveAccount: resolveAccessorAccount,
      resolveAllowFrom: params.resolveAllowFrom,
      formatAllowFrom: params.formatAllowFrom,
      resolveDefaultTo: params.resolveDefaultTo,
    }),
  };
}

function setTopLevelChannelEnabledInConfigSection<Config extends RemoteClawConfig>(params: {
  cfg: Config;
  sectionKey: string;
  enabled: boolean;
}): Config {
  const section = params.cfg.channels?.[params.sectionKey] as Record<string, unknown> | undefined;
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.sectionKey]: {
        ...section,
        enabled: params.enabled,
      },
    },
  } as Config;
}

function removeTopLevelChannelConfigSection<Config extends RemoteClawConfig>(params: {
  cfg: Config;
  sectionKey: string;
}): Config {
  const nextChannels = { ...params.cfg.channels } as Record<string, unknown>;
  delete nextChannels[params.sectionKey];
  const nextCfg = { ...params.cfg };
  if (Object.keys(nextChannels).length > 0) {
    nextCfg.channels = nextChannels as Config["channels"];
  } else {
    delete nextCfg.channels;
  }
  return nextCfg;
}

function clearTopLevelChannelConfigFields<Config extends RemoteClawConfig>(params: {
  cfg: Config;
  sectionKey: string;
  clearBaseFields: string[];
}): Config {
  const section = params.cfg.channels?.[params.sectionKey] as Record<string, unknown> | undefined;
  if (!section) {
    return params.cfg;
  }
  const nextSection = { ...section };
  for (const field of params.clearBaseFields) {
    delete nextSection[field];
  }
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.sectionKey]: nextSection,
    },
  } as Config;
}

/** Build CRUD/config helpers for top-level single-account channels. */
export function createTopLevelChannelConfigBase<
  ResolvedAccount,
  Config extends RemoteClawConfig = RemoteClawConfig,
>(params: {
  sectionKey: string;
  resolveAccount: (cfg: Config) => ResolvedAccount;
  listAccountIds?: (cfg: Config) => string[];
  defaultAccountId?: (cfg: Config) => string;
  inspectAccount?: (cfg: Config) => unknown;
  deleteMode?: "remove-section" | "clear-fields";
  clearBaseFields?: string[];
}): Pick<
  ChannelConfigAdapter<ResolvedAccount>,
  | "listAccountIds"
  | "resolveAccount"
  | "inspectAccount"
  | "defaultAccountId"
  | "setAccountEnabled"
  | "deleteAccount"
> {
  return {
    listAccountIds: (cfg) => params.listAccountIds?.(cfg as Config) ?? [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg) => params.resolveAccount(cfg as Config),
    inspectAccount: params.inspectAccount
      ? (cfg) => params.inspectAccount?.(cfg as Config)
      : undefined,
    defaultAccountId: (cfg) => params.defaultAccountId?.(cfg as Config) ?? DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) =>
      setTopLevelChannelEnabledInConfigSection({
        cfg: cfg as Config,
        sectionKey: params.sectionKey,
        enabled,
      }),
    deleteAccount: ({ cfg }) =>
      params.deleteMode === "clear-fields"
        ? clearTopLevelChannelConfigFields({
            cfg: cfg as Config,
            sectionKey: params.sectionKey,
            clearBaseFields: params.clearBaseFields ?? [],
          })
        : removeTopLevelChannelConfigSection({
            cfg: cfg as Config,
            sectionKey: params.sectionKey,
          }),
  };
}

/** Build the full shared config adapter for top-level single-account channels with allowlist/default target accessors. */
export function createTopLevelChannelConfigAdapter<
  ResolvedAccount,
  AccessorAccount = ResolvedAccount,
  Config extends RemoteClawConfig = RemoteClawConfig,
>(params: {
  sectionKey: string;
  resolveAccount: (cfg: Config) => ResolvedAccount;
  resolveAccessorAccount?: (params: { cfg: Config; accountId?: string | null }) => AccessorAccount;
  listAccountIds?: (cfg: Config) => string[];
  defaultAccountId?: (cfg: Config) => string;
  inspectAccount?: (cfg: Config) => unknown;
  deleteMode?: "remove-section" | "clear-fields";
  clearBaseFields?: string[];
  resolveAllowFrom: (account: AccessorAccount) => Array<string | number> | null | undefined;
  formatAllowFrom: (allowFrom: Array<string | number>) => string[];
  resolveDefaultTo?: (account: AccessorAccount) => string | number | null | undefined;
}): Pick<
  ChannelConfigAdapter<ResolvedAccount>,
  | "listAccountIds"
  | "resolveAccount"
  | "inspectAccount"
  | "defaultAccountId"
  | "setAccountEnabled"
  | "deleteAccount"
  | "resolveAllowFrom"
  | "formatAllowFrom"
  | "resolveDefaultTo"
> {
  const resolveAccessorAccount =
    params.resolveAccessorAccount ??
    (({ cfg }: { cfg: Config; accountId?: string | null }) =>
      params.resolveAccount(cfg) as unknown as AccessorAccount);

  return {
    ...createTopLevelChannelConfigBase<ResolvedAccount, Config>({
      sectionKey: params.sectionKey,
      resolveAccount: params.resolveAccount,
      listAccountIds: params.listAccountIds,
      defaultAccountId: params.defaultAccountId,
      inspectAccount: params.inspectAccount,
      deleteMode: params.deleteMode,
      clearBaseFields: params.clearBaseFields,
    }),
    ...createScopedAccountConfigAccessors<AccessorAccount>({
      resolveAccount: resolveAccessorAccount,
      resolveAllowFrom: params.resolveAllowFrom,
      formatAllowFrom: params.formatAllowFrom,
      resolveDefaultTo: params.resolveDefaultTo,
    }),
  };
}

/** Build CRUD/config helpers for channels where the default account lives at channel root and named accounts live under `accounts`. */
export function createHybridChannelConfigBase<
  ResolvedAccount,
  Config extends RemoteClawConfig = RemoteClawConfig,
>(params: {
  sectionKey: string;
  listAccountIds: (cfg: Config) => string[];
  resolveAccount: (cfg: Config, accountId?: string | null) => ResolvedAccount;
  defaultAccountId: (cfg: Config) => string;
  inspectAccount?: (cfg: Config, accountId?: string | null) => unknown;
  clearBaseFields: string[];
  preserveSectionOnDefaultDelete?: boolean;
}): Pick<
  ChannelConfigAdapter<ResolvedAccount>,
  | "listAccountIds"
  | "resolveAccount"
  | "inspectAccount"
  | "defaultAccountId"
  | "setAccountEnabled"
  | "deleteAccount"
> {
  return {
    listAccountIds: (cfg) => params.listAccountIds(cfg as Config),
    resolveAccount: (cfg, accountId) => params.resolveAccount(cfg as Config, accountId),
    inspectAccount: params.inspectAccount
      ? (cfg, accountId) => params.inspectAccount?.(cfg as Config, accountId)
      : undefined,
    defaultAccountId: (cfg) => params.defaultAccountId(cfg as Config),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      if (normalizeAccountId(accountId) === DEFAULT_ACCOUNT_ID) {
        return setTopLevelChannelEnabledInConfigSection({
          cfg: cfg as Config,
          sectionKey: params.sectionKey,
          enabled,
        });
      }
      return setAccountEnabledInConfigSection({
        cfg: cfg as Config,
        sectionKey: params.sectionKey,
        accountId,
        enabled,
      });
    },
    deleteAccount: ({ cfg, accountId }) => {
      if (normalizeAccountId(accountId) === DEFAULT_ACCOUNT_ID) {
        if (params.preserveSectionOnDefaultDelete) {
          return clearTopLevelChannelConfigFields({
            cfg: cfg as Config,
            sectionKey: params.sectionKey,
            clearBaseFields: params.clearBaseFields,
          });
        }
        return deleteAccountFromConfigSection({
          cfg: cfg as Config,
          sectionKey: params.sectionKey,
          accountId,
          clearBaseFields: params.clearBaseFields,
        });
      }
      return deleteAccountFromConfigSection({
        cfg: cfg as Config,
        sectionKey: params.sectionKey,
        accountId,
        clearBaseFields: params.clearBaseFields,
      });
    },
  };
}

/** Build the full shared config adapter for hybrid channels with allowlist/default target accessors. */
export function createHybridChannelConfigAdapter<
  ResolvedAccount,
  AccessorAccount = ResolvedAccount,
  Config extends RemoteClawConfig = RemoteClawConfig,
>(params: {
  sectionKey: string;
  listAccountIds: (cfg: Config) => string[];
  resolveAccount: (cfg: Config, accountId?: string | null) => ResolvedAccount;
  resolveAccessorAccount?: (params: { cfg: Config; accountId?: string | null }) => AccessorAccount;
  defaultAccountId: (cfg: Config) => string;
  inspectAccount?: (cfg: Config, accountId?: string | null) => unknown;
  clearBaseFields: string[];
  preserveSectionOnDefaultDelete?: boolean;
  resolveAllowFrom: (account: AccessorAccount) => Array<string | number> | null | undefined;
  formatAllowFrom: (allowFrom: Array<string | number>) => string[];
  resolveDefaultTo?: (account: AccessorAccount) => string | number | null | undefined;
}): Pick<
  ChannelConfigAdapter<ResolvedAccount>,
  | "listAccountIds"
  | "resolveAccount"
  | "inspectAccount"
  | "defaultAccountId"
  | "setAccountEnabled"
  | "deleteAccount"
  | "resolveAllowFrom"
  | "formatAllowFrom"
  | "resolveDefaultTo"
> {
  const resolveAccessorAccount =
    params.resolveAccessorAccount ??
    (({ cfg, accountId }: { cfg: Config; accountId?: string | null }) =>
      params.resolveAccount(cfg, accountId) as unknown as AccessorAccount);

  return {
    ...createHybridChannelConfigBase<ResolvedAccount, Config>({
      sectionKey: params.sectionKey,
      listAccountIds: params.listAccountIds,
      resolveAccount: params.resolveAccount,
      inspectAccount: params.inspectAccount,
      defaultAccountId: params.defaultAccountId,
      clearBaseFields: params.clearBaseFields,
      preserveSectionOnDefaultDelete: params.preserveSectionOnDefaultDelete,
    }),
    ...createScopedAccountConfigAccessors<AccessorAccount>({
      resolveAccount: resolveAccessorAccount,
      resolveAllowFrom: params.resolveAllowFrom,
      formatAllowFrom: params.formatAllowFrom,
      resolveDefaultTo: params.resolveDefaultTo,
    }),
  };
}

/** Convert account-specific DM security fields into the shared runtime policy resolver shape. */
export function createScopedDmSecurityResolver<
  ResolvedAccount extends { accountId?: string | null },
>(params: {
  channelKey: string;
  resolvePolicy: (account: ResolvedAccount) => string | null | undefined;
  resolveAllowFrom: (account: ResolvedAccount) => Array<string | number> | null | undefined;
  resolveFallbackAccountId?: (account: ResolvedAccount) => string | null | undefined;
  defaultPolicy?: string;
  allowFromPathSuffix?: string;
  policyPathSuffix?: string;
  approveChannelId?: string;
  approveHint?: string;
  normalizeEntry?: (raw: string) => string;
}) {
  return ({
    cfg,
    accountId,
    account,
  }: {
    cfg: RemoteClawConfig;
    accountId?: string | null;
    account: ResolvedAccount;
  }) =>
    buildAccountScopedDmSecurityPolicy({
      cfg,
      channelKey: params.channelKey,
      accountId,
      fallbackAccountId: params.resolveFallbackAccountId?.(account) ?? account.accountId,
      policy: params.resolvePolicy(account),
      allowFrom: params.resolveAllowFrom(account) ?? [],
      defaultPolicy: params.defaultPolicy,
      allowFromPathSuffix: params.allowFromPathSuffix,
      policyPathSuffix: params.policyPathSuffix,
      approveChannelId: params.approveChannelId,
      approveHint: params.approveHint,
      normalizeEntry: params.normalizeEntry,
    });
}

export { buildAccountScopedDmSecurityPolicy };
export {
  collectAllowlistProviderGroupPolicyWarnings,
  collectAllowlistProviderRestrictSendersWarnings,
  collectOpenGroupPolicyConfiguredRouteWarnings,
  collectOpenGroupPolicyRouteAllowlistWarnings,
  collectOpenProviderGroupPolicyWarnings,
};

/** Read the effective WhatsApp allowlist through the active plugin contract. */
export function resolveWhatsAppConfigAllowFrom(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): string[] {
  return resolveWhatsAppAccount(params).allowFrom ?? [];
}

export function formatWhatsAppConfigAllowFromEntries(allowFrom: Array<string | number>): string[] {
  return normalizeWhatsAppAllowFromEntries(allowFrom);
}

export function resolveWhatsAppConfigDefaultTo(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): string | undefined {
  const root = params.cfg.channels?.whatsapp;
  const normalized = normalizeAccountId(params.accountId);
  const account = root?.accounts?.[normalized];
  return (account?.defaultTo ?? root?.defaultTo)?.trim() || undefined;
}

export function resolveIMessageConfigAllowFrom(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): string[] {
  return mapAllowFromEntries(resolveIMessageAccount(params).config.allowFrom);
}

export function resolveIMessageConfigDefaultTo(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): string | undefined {
  return resolveOptionalConfigString(resolveIMessageAccount(params).config.defaultTo);
}
