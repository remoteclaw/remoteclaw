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
