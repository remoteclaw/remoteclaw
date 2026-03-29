/** Shared directory listing helpers for plugins that derive users/groups from config maps. */
// STRIPPED: export type { DirectoryConfigParams } from "../channels/plugins/directory-types.js";
export type {
  ChannelDirectoryEntry,
  ChannelDirectoryEntryKind,
} from "../channels/plugins/types.js";
// STRIPPED: export type { ReadOnlyInspectedAccount } from "../channels/read-only-account-inspect.js";
// STRIPPED: export {
//   createChannelDirectoryAdapter,
//   createEmptyChannelDirectoryAdapter,
//   emptyChannelDirectoryList,
//   nullChannelDirectorySelf,
// } from "../channels/plugins/directory-adapters.js";
export {
  applyDirectoryQueryAndLimit,
  collectNormalizedDirectoryIds,
// STRIPPED (not in fork):   listDirectoryEntriesFromSources,
  listDirectoryGroupEntriesFromMapKeys,
  listDirectoryGroupEntriesFromMapKeysAndAllowFrom,
// STRIPPED (not in fork):   listInspectedDirectoryEntriesFromSources,
// STRIPPED (not in fork):   listResolvedDirectoryEntriesFromSources,
// STRIPPED (not in fork):   listResolvedDirectoryGroupEntriesFromMapKeys,
// STRIPPED (not in fork):   listResolvedDirectoryUserEntriesFromAllowFrom,
  listDirectoryUserEntriesFromAllowFrom,
  listDirectoryUserEntriesFromAllowFromAndMapKeys,
  toDirectoryEntries,
} from "../channels/plugins/directory-config-helpers.js";
// STRIPPED: export { createRuntimeDirectoryLiveAdapter } from "../channels/plugins/runtime-forwarders.js";
// STRIPPED: export { inspectReadOnlyChannelAccount } from "../channels/read-only-account-inspect.js";
