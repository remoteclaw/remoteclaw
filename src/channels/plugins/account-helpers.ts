import type { RemoteClawConfig } from "../../config/config.js";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "../../routing/session-key.js";

export function createAccountListHelpers(
  channelKey: string,
  options?: { normalizeAccountId?: (id: string) => string; allowUnlistedDefaultAccount?: boolean },
) {
  function listConfiguredAccountIds(cfg: RemoteClawConfig): string[] {
    const channel = cfg.channels?.[channelKey];
    const accounts = (channel as Record<string, unknown> | undefined)?.accounts;
    if (!accounts || typeof accounts !== "object") {
      return [];
    }
    const ids = Object.keys(accounts as Record<string, unknown>).filter(Boolean);
    const normalizeConfiguredAccountId = options?.normalizeAccountId;
    if (!normalizeConfiguredAccountId) {
      return ids;
    }
    return [...new Set(ids.map((id) => normalizeConfiguredAccountId(id)).filter(Boolean))];
  }

  function listAccountIds(cfg: RemoteClawConfig): string[] {
    return listCombinedAccountIds({
      configuredAccountIds: listConfiguredAccountIds(cfg),
      fallbackAccountIdWhenEmpty: DEFAULT_ACCOUNT_ID,
    });
  }

  function resolveDefaultAccountId(cfg: RemoteClawConfig): string {
    const channel = cfg.channels?.[channelKey] as Record<string, unknown> | undefined;
    const rawPreferred = normalizeOptionalAccountId(
      typeof channel?.defaultAccount === "string" ? channel.defaultAccount : undefined,
    );
    return resolveListedDefaultAccountId({
      accountIds: listAccountIds(cfg),
      configuredDefaultAccountId: rawPreferred,
      allowUnlistedDefaultAccount: options?.allowUnlistedDefaultAccount,
    });
  }

  return { listConfiguredAccountIds, listAccountIds, resolveDefaultAccountId };
}

export function listCombinedAccountIds(params: {
  configuredAccountIds: Iterable<string>;
  additionalAccountIds?: Iterable<string>;
  implicitAccountId?: string | undefined;
  fallbackAccountIdWhenEmpty?: string | undefined;
}): string[] {
  const ids = new Set<string>();

  for (const id of params.configuredAccountIds) {
    if (id) {
      ids.add(id);
    }
  }
  for (const id of params.additionalAccountIds ?? []) {
    if (id) {
      ids.add(id);
    }
  }
  if (params.implicitAccountId) {
    ids.add(params.implicitAccountId);
  }

  if (ids.size === 0 && params.fallbackAccountIdWhenEmpty) {
    return [params.fallbackAccountIdWhenEmpty];
  }
  return [...ids].toSorted((a, b) => a.localeCompare(b));
}

export function resolveListedDefaultAccountId(params: {
  accountIds: readonly string[];
  configuredDefaultAccountId?: string | undefined;
  allowUnlistedDefaultAccount?: boolean;
  ambiguousFallbackAccountId?: string | undefined;
  normalizeListedAccountId?: ((accountId: string) => string) | undefined;
}): string {
  const preferred = params.configuredDefaultAccountId;
  const normalizeListedAccountId = params.normalizeListedAccountId ?? normalizeAccountId;
  if (
    preferred &&
    (params.allowUnlistedDefaultAccount ||
      params.accountIds.some((accountId) => normalizeListedAccountId(accountId) === preferred))
  ) {
    return preferred;
  }
  if (params.accountIds.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  if (params.ambiguousFallbackAccountId && params.accountIds.length > 1) {
    return params.ambiguousFallbackAccountId;
  }
  return params.accountIds[0] ?? DEFAULT_ACCOUNT_ID;
}
<<<<<<< HEAD
||||||| parent of ff941b0193 (refactor: share nested account config merges)

export function mergeAccountConfig<TConfig extends Record<string, unknown>>(params: {
  channelConfig: TConfig | undefined;
  accountConfig: Partial<TConfig> | undefined;
  omitKeys?: string[];
}): TConfig {
  const omitKeys = new Set(["accounts", ...(params.omitKeys ?? [])]);
  const base = Object.fromEntries(
    Object.entries((params.channelConfig ?? {}) as Record<string, unknown>).filter(
      ([key]) => !omitKeys.has(key),
    ),
  ) as TConfig;
  return {
    ...base,
    ...params.accountConfig,
  };
}

export function resolveMergedAccountConfig<TConfig extends Record<string, unknown>>(params: {
  channelConfig: TConfig | undefined;
  accounts: Record<string, Partial<TConfig>> | undefined;
  accountId: string;
  omitKeys?: string[];
  normalizeAccountId?: (accountId: string) => string;
}): TConfig {
  const accountConfig = params.normalizeAccountId
    ? resolveNormalizedAccountEntry(params.accounts, params.accountId, params.normalizeAccountId)
    : resolveAccountEntry(params.accounts, params.accountId);
  return mergeAccountConfig<TConfig>({
    channelConfig: params.channelConfig,
    accountConfig,
    omitKeys: params.omitKeys,
  });
}
=======

export function mergeAccountConfig<TConfig extends Record<string, unknown>>(params: {
  channelConfig: TConfig | undefined;
  accountConfig: Partial<TConfig> | undefined;
  omitKeys?: string[];
  nestedObjectKeys?: string[];
}): TConfig {
  const omitKeys = new Set(["accounts", ...(params.omitKeys ?? [])]);
  const base = Object.fromEntries(
    Object.entries((params.channelConfig ?? {}) as Record<string, unknown>).filter(
      ([key]) => !omitKeys.has(key),
    ),
  ) as TConfig;
  const merged = {
    ...base,
    ...params.accountConfig,
  };
  for (const key of params.nestedObjectKeys ?? []) {
    const baseValue = base[key as keyof TConfig];
    const accountValue = params.accountConfig?.[key as keyof TConfig];
    if (
      typeof baseValue === "object" &&
      baseValue != null &&
      !Array.isArray(baseValue) &&
      typeof accountValue === "object" &&
      accountValue != null &&
      !Array.isArray(accountValue)
    ) {
      (merged as Record<string, unknown>)[key] = {
        ...(baseValue as Record<string, unknown>),
        ...(accountValue as Record<string, unknown>),
      };
    }
  }
  return merged;
}

export function resolveMergedAccountConfig<TConfig extends Record<string, unknown>>(params: {
  channelConfig: TConfig | undefined;
  accounts: Record<string, Partial<TConfig>> | undefined;
  accountId: string;
  omitKeys?: string[];
  normalizeAccountId?: (accountId: string) => string;
  nestedObjectKeys?: string[];
}): TConfig {
  const accountConfig = params.normalizeAccountId
    ? resolveNormalizedAccountEntry(params.accounts, params.accountId, params.normalizeAccountId)
    : resolveAccountEntry(params.accounts, params.accountId);
  return mergeAccountConfig<TConfig>({
    channelConfig: params.channelConfig,
    accountConfig,
    omitKeys: params.omitKeys,
    nestedObjectKeys: params.nestedObjectKeys,
  });
}
>>>>>>> ff941b0193 (refactor: share nested account config merges)
