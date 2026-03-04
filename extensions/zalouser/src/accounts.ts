import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "remoteclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "remoteclaw/plugin-sdk/compat";
import type { ResolvedZalouserAccount, ZalouserAccountConfig, ZalouserConfig } from "./types.js";
import { checkZaloAuthenticated, getZaloUserInfo } from "./zalo-js.js";

function listConfiguredAccountIds(cfg: RemoteClawConfig): string[] {
  const accounts = (cfg.channels?.zalouser as ZalouserConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listZalouserAccountIds(cfg: RemoteClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultZalouserAccountId(cfg: RemoteClawConfig): string {
  const zalouserConfig = cfg.channels?.zalouser as ZalouserConfig | undefined;
  const preferred = normalizeOptionalAccountId(zalouserConfig?.defaultAccount);
  if (
    preferred &&
    listZalouserAccountIds(cfg).some((accountId) => normalizeAccountId(accountId) === preferred)
  ) {
    return preferred;
  }
  const ids = listZalouserAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: RemoteClawConfig,
  accountId: string,
): ZalouserAccountConfig | undefined {
  const accounts = (cfg.channels?.zalouser as ZalouserConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId] as ZalouserAccountConfig | undefined;
}

function mergeZalouserAccountConfig(
  cfg: RemoteClawConfig,
  accountId: string,
): ZalouserAccountConfig {
  const raw = (cfg.channels?.zalouser ?? {}) as ZalouserConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

function resolveProfile(config: ZalouserAccountConfig, accountId: string): string {
  if (config.profile?.trim()) {
    return config.profile.trim();
  }
  if (process.env.ZALOUSER_PROFILE?.trim()) {
    return process.env.ZALOUSER_PROFILE.trim();
  }
  if (process.env.ZCA_PROFILE?.trim()) {
    return process.env.ZCA_PROFILE.trim();
  }
  if (accountId !== DEFAULT_ACCOUNT_ID) {
    return accountId;
  }
  return "default";
}

export async function resolveZalouserAccount(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): Promise<ResolvedZalouserAccount> {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.zalouser as ZalouserConfig | undefined)?.enabled !== false;
  const merged = mergeZalouserAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const profile = resolveProfile(merged, accountId);
  const authenticated = await checkZaloAuthenticated(profile);

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    profile,
    authenticated,
    config: merged,
  };
}

export function resolveZalouserAccountSync(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): ResolvedZalouserAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.zalouser as ZalouserConfig | undefined)?.enabled !== false;
  const merged = mergeZalouserAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const profile = resolveProfile(merged, accountId);

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    profile,
    authenticated: false,
    config: merged,
  };
}

export async function listEnabledZalouserAccounts(
  cfg: RemoteClawConfig,
): Promise<ResolvedZalouserAccount[]> {
  const ids = listZalouserAccountIds(cfg);
  const accounts = await Promise.all(
    ids.map((accountId) => resolveZalouserAccount({ cfg, accountId })),
  );
  return accounts.filter((account) => account.enabled);
}

export async function getZcaUserInfo(
  profile: string,
): Promise<{ userId?: string; displayName?: string } | null> {
  const info = await getZaloUserInfo(profile);
  if (!info) {
    return null;
  }
  return {
    userId: info.userId,
    displayName: info.displayName,
  };
}

export { checkZaloAuthenticated as checkZcaAuthenticated };

export type { ResolvedZalouserAccount } from "./types.js";
