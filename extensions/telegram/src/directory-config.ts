import { mapAllowFromEntries } from "remoteclaw/plugin-sdk/channel-config-helpers";
import {
  applyDirectoryQueryAndLimit,
  collectNormalizedDirectoryIds,
  listDirectoryGroupEntriesFromMapKeys,
  toDirectoryEntries,
  type DirectoryConfigParams,
} from "remoteclaw/plugin-sdk/directory-runtime";
import { inspectTelegramAccount, type InspectedTelegramAccount } from "./account-inspect.js";

export async function listTelegramDirectoryPeersFromConfig(params: DirectoryConfigParams) {
  const account = await inspectTelegramDirectoryAccount(params);
  if (!account || !("config" in account)) {
    return [];
  }

  const ids = collectNormalizedDirectoryIds({
    sources: [mapAllowFromEntries(account.config.allowFrom), Object.keys(account.config.dms ?? {})],
    normalizeId: (entry) => {
      const trimmed = entry.replace(/^(telegram|tg):/i, "").trim();
      if (!trimmed) {
        return null;
      }
      if (/^-?\d+$/.test(trimmed)) {
        return trimmed;
      }
      return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
    },
  });
  return toDirectoryEntries("user", applyDirectoryQueryAndLimit(ids, params));
}

export async function listTelegramDirectoryGroupsFromConfig(params: DirectoryConfigParams) {
  const account = await inspectTelegramDirectoryAccount(params);
  if (!account || !("config" in account)) {
    return [];
  }
  return listDirectoryGroupEntriesFromMapKeys({
    groups: account.config.groups,
    query: params.query,
    limit: params.limit,
  });
}
