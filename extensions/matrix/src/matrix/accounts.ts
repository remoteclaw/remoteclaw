<<<<<<< HEAD
import { normalizeAccountId } from "remoteclaw/plugin-sdk/account-id";
import { createAccountListHelpers } from "remoteclaw/plugin-sdk/matrix";
||||||| parent of ff941b0193 (refactor: share nested account config merges)
import {
  resolveConfiguredMatrixAccountIds,
  resolveMatrixDefaultOrOnlyAccountId,
} from "../account-selection.js";
import {
  DEFAULT_ACCOUNT_ID,
  hasConfiguredSecretInput,
  normalizeAccountId,
} from "../runtime-api.js";
=======
import { resolveMergedAccountConfig } from "openclaw/plugin-sdk/account-resolution";
import {
  resolveConfiguredMatrixAccountIds,
  resolveMatrixDefaultOrOnlyAccountId,
} from "../account-selection.js";
import {
  DEFAULT_ACCOUNT_ID,
  hasConfiguredSecretInput,
  normalizeAccountId,
} from "../runtime-api.js";
>>>>>>> ff941b0193 (refactor: share nested account config merges)
import type { CoreConfig, MatrixConfig } from "../types.js";
<<<<<<< HEAD
||||||| parent of ff941b0193 (refactor: share nested account config merges)
import { findMatrixAccountConfig, resolveMatrixBaseConfig } from "./account-config.js";
=======
import { resolveMatrixBaseConfig } from "./account-config.js";
>>>>>>> ff941b0193 (refactor: share nested account config merges)
import { resolveMatrixConfigForAccount } from "./client.js";
import { credentialsMatchConfig, loadMatrixCredentials } from "./credentials.js";

<<<<<<< HEAD
/** Merge account config with top-level defaults, preserving nested objects. */
function mergeAccountConfig(base: MatrixConfig, account: MatrixConfig): MatrixConfig {
  const merged = { ...base, ...account };
  // Deep-merge known nested objects so partial overrides inherit base fields
  for (const key of ["dm", "actions"] as const) {
    const b = base[key];
    const o = account[key];
    if (typeof b === "object" && b != null && typeof o === "object" && o != null) {
      (merged as Record<string, unknown>)[key] = { ...b, ...o };
    }
  }
  // Don't propagate the accounts map into the merged per-account config
  delete (merged as Record<string, unknown>).accounts;
  delete (merged as Record<string, unknown>).defaultAccount;
  return merged;
}

||||||| parent of ff941b0193 (refactor: share nested account config merges)
/** Merge account config with top-level defaults, preserving nested objects. */
function mergeAccountConfig(base: MatrixConfig, account: MatrixConfig): MatrixConfig {
  const merged = { ...base, ...account };
  // Deep-merge known nested objects so partial overrides inherit base fields
  for (const key of ["dm", "actions"] as const) {
    const b = base[key];
    const o = account[key];
    if (typeof b === "object" && b != null && typeof o === "object" && o != null) {
      (merged as Record<string, unknown>)[key] = { ...b, ...o };
    }
  }
  // Don't propagate the accounts map into the merged per-account config
  delete (merged as Record<string, unknown>).accounts;
  return merged;
}

=======
>>>>>>> ff941b0193 (refactor: share nested account config merges)
export type ResolvedMatrixAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  homeserver?: string;
  userId?: string;
  config: MatrixConfig;
};

const {
  listAccountIds: listMatrixAccountIds,
  resolveDefaultAccountId: resolveDefaultMatrixAccountId,
} = createAccountListHelpers("matrix", { normalizeAccountId });
export { listMatrixAccountIds, resolveDefaultMatrixAccountId };

function resolveAccountConfig(cfg: CoreConfig, accountId: string): MatrixConfig | undefined {
  const accounts = cfg.channels?.matrix?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  // Direct lookup first (fast path for already-normalized keys)
  if (accounts[accountId]) {
    return accounts[accountId] as MatrixConfig;
  }
  // Fall back to case-insensitive match (user may have mixed-case keys in config)
  const normalized = normalizeAccountId(accountId);
  for (const key of Object.keys(accounts)) {
    if (normalizeAccountId(key) === normalized) {
      return accounts[key] as MatrixConfig;
    }
  }
  return undefined;
}

export function resolveMatrixAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedMatrixAccount {
  const accountId = normalizeAccountId(params.accountId);
  const matrixBase = params.cfg.channels?.matrix ?? {};
  const base = resolveMatrixAccountConfig({ cfg: params.cfg, accountId });
  const enabled = base.enabled !== false && matrixBase.enabled !== false;

  const resolved = resolveMatrixConfigForAccount(params.cfg, accountId, process.env);
  const hasHomeserver = Boolean(resolved.homeserver);
  const hasUserId = Boolean(resolved.userId);
  const hasAccessToken = Boolean(resolved.accessToken);
  const hasPassword = Boolean(resolved.password);
  const hasPasswordAuth = hasUserId && hasPassword;
  const stored = loadMatrixCredentials(process.env, accountId);
  const hasStored =
    stored && resolved.homeserver
      ? credentialsMatchConfig(stored, {
          homeserver: resolved.homeserver,
          userId: resolved.userId || "",
        })
      : false;
  const configured = hasHomeserver && (hasAccessToken || hasPasswordAuth || Boolean(hasStored));
  return {
    accountId,
    enabled,
    name: base.name?.trim() || undefined,
    configured,
    homeserver: resolved.homeserver || undefined,
    userId: resolved.userId || undefined,
    config: base,
  };
}

export function resolveMatrixAccountConfig(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): MatrixConfig {
  const accountId = normalizeAccountId(params.accountId);
<<<<<<< HEAD
  const matrixBase = params.cfg.channels?.matrix ?? {};
  const accountConfig = resolveAccountConfig(params.cfg, accountId);
  if (!accountConfig) {
    return matrixBase;
  }
  // Merge account-specific config with top-level defaults so settings like
  // groupPolicy and blockStreaming inherit when not overridden.
  return mergeAccountConfig(matrixBase, accountConfig);
||||||| parent of ff941b0193 (refactor: share nested account config merges)
  const matrixBase = resolveMatrixBaseConfig(params.cfg);
  const accountConfig = findMatrixAccountConfig(params.cfg, accountId);
  if (!accountConfig) {
    return matrixBase;
  }
  // Merge account-specific config with top-level defaults so settings like
  // groupPolicy and blockStreaming inherit when not overridden.
  return mergeAccountConfig(matrixBase, accountConfig);
=======
  return resolveMergedAccountConfig<MatrixConfig>({
    channelConfig: resolveMatrixBaseConfig(params.cfg),
    accounts: params.cfg.channels?.matrix?.accounts as
      | Record<string, Partial<MatrixConfig>>
      | undefined,
    accountId,
    normalizeAccountId,
    nestedObjectKeys: ["dm", "actions"],
  });
>>>>>>> ff941b0193 (refactor: share nested account config merges)
}

export function listEnabledMatrixAccounts(cfg: CoreConfig): ResolvedMatrixAccount[] {
  return listMatrixAccountIds(cfg)
    .map((accountId) => resolveMatrixAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
