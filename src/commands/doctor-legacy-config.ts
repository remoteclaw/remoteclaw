import { shouldMoveSingleAccountChannelKey } from "../channels/plugins/setup-helpers.js";
import type { RemoteClawConfig } from "../config/config.js";
import { DEFAULT_ACCOUNT_ID } from "../routing/session-key.js";

export function normalizeLegacyConfigValues(cfg: RemoteClawConfig): {
  config: RemoteClawConfig;
  changes: string[];
} {
  const changes: string[] = [];
  let next: RemoteClawConfig = cfg;

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const seedMissingDefaultAccountsFromSingleAccountBase = () => {
    const channels = next.channels as Record<string, unknown> | undefined;
    if (!channels) {
      return;
    }

    let channelsChanged = false;
    const nextChannels = { ...channels };
    for (const [channelId, rawChannel] of Object.entries(channels)) {
      if (!isRecord(rawChannel)) {
        continue;
      }
      const rawAccounts = rawChannel.accounts;
      if (!isRecord(rawAccounts)) {
        continue;
      }
      const accountKeys = Object.keys(rawAccounts);
      if (accountKeys.length === 0) {
        continue;
      }
      const hasDefault = accountKeys.some((key) => key.trim().toLowerCase() === DEFAULT_ACCOUNT_ID);
      if (hasDefault) {
        continue;
      }

      const keysToMove = Object.entries(rawChannel)
        .filter(
          ([key, value]) =>
            key !== "accounts" &&
            key !== "enabled" &&
            value !== undefined &&
            shouldMoveSingleAccountChannelKey({ channelKey: channelId, key }),
        )
        .map(([key]) => key);
      if (keysToMove.length === 0) {
        continue;
      }

      const defaultAccount: Record<string, unknown> = {};
      for (const key of keysToMove) {
        const value = rawChannel[key];
        defaultAccount[key] = value && typeof value === "object" ? structuredClone(value) : value;
      }
      const nextChannel: Record<string, unknown> = {
        ...rawChannel,
      };
      for (const key of keysToMove) {
        delete nextChannel[key];
      }
      nextChannel.accounts = {
        ...rawAccounts,
        [DEFAULT_ACCOUNT_ID]: defaultAccount,
      };

      nextChannels[channelId] = nextChannel;
      channelsChanged = true;
      changes.push(
        `Moved channels.${channelId} single-account top-level values into channels.${channelId}.accounts.default.`,
      );
    }

    if (!channelsChanged) {
      return;
    }
    next = {
      ...next,
      channels: nextChannels as RemoteClawConfig["channels"],
    };
  };

  seedMissingDefaultAccountsFromSingleAccountBase();

  return { config: next, changes };
}
