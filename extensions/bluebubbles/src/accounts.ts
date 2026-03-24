import {
  createAccountListHelpers,
  mergeAccountConfig,
} from "remoteclaw/plugin-sdk/account-helpers";
import { normalizeAccountId } from "remoteclaw/plugin-sdk/account-id";
import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/core";
import { hasConfiguredSecretInput, normalizeSecretInputString } from "./secret-input.js";
import { normalizeBlueBubblesServerUrl, type BlueBubblesAccountConfig } from "./types.js";

export type ResolvedBlueBubblesAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  config: BlueBubblesAccountConfig;
  configured: boolean;
  baseUrl?: string;
};

const {
  listAccountIds: listBlueBubblesAccountIds,
  resolveDefaultAccountId: resolveDefaultBlueBubblesAccountId,
} = createAccountListHelpers("bluebubbles");
export { listBlueBubblesAccountIds, resolveDefaultBlueBubblesAccountId };

function mergeBlueBubblesAccountConfig(
  cfg: RemoteClawConfig,
  accountId: string,
): BlueBubblesAccountConfig {
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  const merged = mergeAccountConfig<BlueBubblesAccountConfig>({
    channelConfig: cfg.channels?.bluebubbles as BlueBubblesAccountConfig | undefined,
    accountConfig: account,
    omitKeys: ["defaultAccount"],
  });
  const chunkMode = account.chunkMode ?? merged.chunkMode ?? "length";
  return { ...merged, chunkMode };
}

export function resolveBlueBubblesAccount(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): ResolvedBlueBubblesAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = params.cfg.channels?.bluebubbles?.enabled;
  const merged = mergeBlueBubblesAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const serverUrl = merged.serverUrl?.trim();
  const password = merged.password?.trim();
  const configured = Boolean(serverUrl && password);
  const baseUrl = serverUrl ? normalizeBlueBubblesServerUrl(serverUrl) : undefined;
  return {
    accountId,
    enabled: baseEnabled !== false && accountEnabled,
    name: merged.name?.trim() || undefined,
    config: merged,
    configured,
    baseUrl,
  };
}

export function listEnabledBlueBubblesAccounts(
  cfg: RemoteClawConfig,
): ResolvedBlueBubblesAccount[] {
  return listBlueBubblesAccountIds(cfg)
    .map((accountId) => resolveBlueBubblesAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
