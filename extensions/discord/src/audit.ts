import type { RemoteClawConfig } from "../../../src/config/config.js";
import { inspectDiscordAccount } from "./account-inspect.js";
import {
  auditDiscordChannelPermissionsWithFetcher,
  collectDiscordAuditChannelIdsForGuilds,
  type DiscordChannelPermissionsAudit,
} from "./audit-core.js";
import { fetchChannelPermissionsDiscord } from "./send.js";

export type {
  DiscordChannelPermissionsAudit,
  DiscordChannelPermissionsAuditEntry,
} from "./audit-core.js";

export function collectDiscordAuditChannelIds(params: {
  cfg: RemoteClawConfig;
  accountId?: string | null;
}) {
  const account = inspectDiscordAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  return collectDiscordAuditChannelIdsForGuilds(account.config.guilds);
}

export async function auditDiscordChannelPermissions(params: {
  token: string;
  accountId?: string | null;
  channelIds: string[];
  timeoutMs: number;
}): Promise<DiscordChannelPermissionsAudit> {
  return await auditDiscordChannelPermissionsWithFetcher({
    ...params,
    fetchChannelPermissions: fetchChannelPermissionsDiscord,
  });
}
