import type { RemoteClawConfig } from "../../config/config.js";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "../../routing/session-key.js";
import type { ChannelAccountSnapshot } from "./types.core.js";

export function createAccountListHelpers(
  channelKey: string,
  options?: { normalizeAccountId?: (id: string) => string },
) {
  function resolveConfiguredDefaultAccountId(cfg: RemoteClawConfig): string | undefined {
    const channel = cfg.channels?.[channelKey] as Record<string, unknown> | undefined;
    const preferred = normalizeOptionalAccountId(
      typeof channel?.defaultAccount === "string" ? channel.defaultAccount : undefined,
    );
    if (!preferred) {
      return undefined;
    }
    const ids = listAccountIds(cfg);
    if (ids.some((id) => normalizeAccountId(id) === preferred)) {
      return preferred;
    }
    return undefined;
  }

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
    const ids = listConfiguredAccountIds(cfg);
    if (ids.length === 0) {
      return [DEFAULT_ACCOUNT_ID];
    }
    return ids.toSorted((a, b) => a.localeCompare(b));
  }

  function resolveDefaultAccountId(cfg: RemoteClawConfig): string {
    const preferred = resolveConfiguredDefaultAccountId(cfg);
    if (preferred) {
      return preferred;
    }
    const ids = listAccountIds(cfg);
    if (ids.includes(DEFAULT_ACCOUNT_ID)) {
      return DEFAULT_ACCOUNT_ID;
    }
    return ids[0] ?? DEFAULT_ACCOUNT_ID;
  }

  return { listConfiguredAccountIds, listAccountIds, resolveDefaultAccountId };
}

export function describeAccountSnapshot<
  TAccount extends {
    accountId?: string | null;
    enabled?: boolean | null;
    name?: string | null | undefined;
  },
>(params: {
  account: TAccount;
  configured?: boolean | undefined;
  extra?: Record<string, unknown> | undefined;
}): ChannelAccountSnapshot {
  return {
    accountId: String(params.account.accountId ?? DEFAULT_ACCOUNT_ID),
    name:
      typeof params.account.name === "string" && params.account.name.trim()
        ? params.account.name
        : undefined,
    enabled: params.account.enabled !== false,
    configured: params.configured,
    ...params.extra,
  };
}
