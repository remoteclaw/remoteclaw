import fs from "node:fs";
import path from "node:path";
import { resolveRemoteClawPackageRootSync } from "../infra/remoteclaw-root.js";
import { listChannelCatalogEntries } from "../plugins/channel-catalog-registry.js";
import type { PluginPackageChannel } from "../plugins/manifest.js";
import { normalizeOptionalLowercaseString } from "../shared/string-coerce.js";
import { uniqueStrings } from "../shared/string-normalization.js";

type ChannelCatalogEntryLike = {
  remoteclaw?: {
    channel?: PluginPackageChannel;
  };
};

type BundledChannelCatalogEntry = {
  id: string;
  channel: PluginPackageChannel;
  aliases: readonly string[];
  order: number;
};

const OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH = path.join("dist", "channel-catalog.json");
const officialCatalogFileCache = new Map<string, ChannelCatalogEntryLike[] | null>();

function listPackageRoots(): string[] {
  return uniqueStrings(
    [
      resolveRemoteClawPackageRootSync({ cwd: process.cwd() }),
      resolveRemoteClawPackageRootSync({ moduleUrl: import.meta.url }),
    ].filter((entry): entry is string => Boolean(entry)),
  );
}

function readBundledExtensionCatalogEntriesSync(): PluginPackageChannel[] {
  try {
    return listChannelCatalogEntries({ origin: "bundled" }).map((entry) => entry.channel);
  } catch {
    return [];
  }
}

function readOfficialCatalogFileSync(): ChannelCatalogEntryLike[] {
  for (const packageRoot of listPackageRoots()) {
    const candidate = path.join(packageRoot, OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH);
    const cached = officialCatalogFileCache.get(candidate);
    if (cached !== undefined) {
      if (cached) {
        return cached;
      }
      continue;
    }
    if (!fs.existsSync(candidate)) {
      officialCatalogFileCache.set(candidate, null);
      continue;
    }
    try {
      const payload = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
        entries?: unknown;
      };
      const entries = Array.isArray(payload.entries)
        ? (payload.entries as ChannelCatalogEntryLike[])
        : [];
      officialCatalogFileCache.set(candidate, entries);
      return entries;
    } catch {
      officialCatalogFileCache.set(candidate, null);
      continue;
    }
  }
  return [];
}

function isChannelCatalogEntryLike(
  entry: ChannelCatalogEntryLike | PluginPackageChannel,
): entry is ChannelCatalogEntryLike {
  return "remoteclaw" in entry;
}

function toBundledChannelEntry(
  entry: ChannelCatalogEntryLike | PluginPackageChannel,
): BundledChannelCatalogEntry | null {
  const channel: PluginPackageChannel | undefined = isChannelCatalogEntryLike(entry)
    ? entry.remoteclaw?.channel
    : entry;
  const id = normalizeOptionalLowercaseString(channel?.id);
  if (!id || !channel) {
    return null;
  }
  const aliases = Array.isArray(channel.aliases)
    ? channel.aliases
        .map((alias) => normalizeOptionalLowercaseString(alias))
        .filter((alias): alias is string => Boolean(alias))
    : [];
  const order =
    typeof channel.order === "number" && Number.isFinite(channel.order)
      ? channel.order
      : Number.MAX_SAFE_INTEGER;
  return {
    id,
    channel,
    aliases,
    order,
  };
}

export function listBundledChannelCatalogEntries(): BundledChannelCatalogEntry[] {
  const entries = new Map<string, BundledChannelCatalogEntry>();
  for (const entry of readBundledExtensionCatalogEntriesSync()) {
    const channelEntry = toBundledChannelEntry(entry);
    if (channelEntry) {
      entries.set(channelEntry.id, channelEntry);
    }
  }
  for (const entry of readOfficialCatalogFileSync()) {
    const channelEntry = toBundledChannelEntry(entry);
    if (channelEntry) {
      entries.set(channelEntry.id, entries.get(channelEntry.id) ?? channelEntry);
    }
  }
  if (entries.size === 0) {
    return [];
  }
  return Array.from(entries.values()).toSorted(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}
