import { normalizeOptionalString } from "remoteclaw/plugin-sdk/text-runtime";
import { createAccountListHelpers } from "../../../src/channels/plugins/account-helpers.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type { SignalAccountConfig } from "../../../src/config/types.js";
import { resolveAccountEntry } from "../../../src/routing/account-lookup.js";
import { normalizeAccountId } from "../../../src/routing/session-key.js";

export type ResolvedSignalAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  baseUrl: string;
  configured: boolean;
  config: SignalAccountConfig;
};

const { listAccountIds, resolveDefaultAccountId } = createAccountListHelpers("signal");
export const listSignalAccountIds = listAccountIds;
export const resolveDefaultSignalAccountId = resolveDefaultAccountId;

function resolveAccountConfig(
  cfg: RemoteClawConfig,
  accountId: string,
): SignalAccountConfig | undefined {
  return resolveAccountEntry(cfg.channels?.signal?.accounts, accountId);
}

function mergeSignalAccountConfig(cfg: RemoteClawConfig, accountId: string): SignalAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.signal ?? {}) as SignalAccountConfig & {
    accounts?: unknown;
  };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveSignalAccount(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): ResolvedSignalAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = params.cfg.channels?.signal?.enabled !== false;
  const merged = mergeSignalAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const host = normalizeOptionalString(merged.httpHost) ?? "127.0.0.1";
  const port = merged.httpPort ?? 8080;
  const baseUrl = normalizeOptionalString(merged.httpUrl) ?? `http://${host}:${port}`;
  const configured = Boolean(
    normalizeOptionalString(merged.account) ||
    normalizeOptionalString(merged.httpUrl) ||
    normalizeOptionalString(merged.cliPath) ||
    normalizeOptionalString(merged.httpHost) ||
    typeof merged.httpPort === "number" ||
    typeof merged.autoStart === "boolean",
  );
  return {
    accountId,
    enabled,
    name: normalizeOptionalString(merged.name),
    baseUrl,
    configured,
    config: merged,
  };
}

export function listEnabledSignalAccounts(cfg: RemoteClawConfig): ResolvedSignalAccount[] {
  return listSignalAccountIds(cfg)
    .map((accountId) => resolveSignalAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
