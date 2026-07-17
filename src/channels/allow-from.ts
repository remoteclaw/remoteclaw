import type { AccessGroupsConfig } from "../config/types.access-groups.js";
import { normalizeStringEntries } from "../shared/string-normalization.js";

export const ACCESS_GROUP_ALLOW_FROM_PREFIX = "accessGroup:";

export function parseAccessGroupAllowFromEntry(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed.startsWith(ACCESS_GROUP_ALLOW_FROM_PREFIX)) {
    return null;
  }
  const name = trimmed.slice(ACCESS_GROUP_ALLOW_FROM_PREFIX.length).trim();
  return name.length > 0 ? name : null;
}

/**
 * Expand `accessGroup:<name>` allowlist references into their concrete member sender entries so a
 * simple literal matcher (e.g. {@link resolveAllowlistMatchSimple}) can admit group members. Only
 * static `message.senders` groups contribute members: the operator-configured shared `members["*"]`
 * bucket plus any channel-scoped `members[channelId]` bucket. A reference to a missing group, or to
 * a dynamic group type (e.g. `discord.channelAudience`) that is not resolvable from static config,
 * contributes NO members and is dropped — fail-closed, matching the shared ingress kernel
 * (`message-access/state.ts` `groupSenderEntries`).
 *
 * Non-`accessGroup:` entries pass through unchanged. Member entries are returned verbatim so the
 * caller normalizes and matches them through the SAME matcher as direct entries — preserving
 * id-first, non-spoofable matching (a member written as a display name matches only when the caller
 * enables dangerous name-matching, exactly like a direct entry). No recursion: a nested
 * `accessGroup:` inside a member list is returned as a literal, consistent with the shared kernel.
 */
export function expandAccessGroupAllowFromEntries(params: {
  entries: readonly (string | number)[];
  accessGroups?: AccessGroupsConfig | null;
  channelId?: string | null;
}): string[] {
  const expanded: string[] = [];
  for (const rawEntry of params.entries) {
    const entry = String(rawEntry);
    const groupName = parseAccessGroupAllowFromEntry(entry);
    if (groupName == null) {
      expanded.push(entry);
      continue;
    }
    const group = params.accessGroups?.[groupName];
    if (!group || group.type !== "message.senders") {
      continue;
    }
    // `members["*"]` is the channel-scope key for entries SHARED across all channels — not an
    // allowlist wildcard. A wildcard only arises if the operator lists `"*"` as a member VALUE,
    // which is explicit and symmetric with a direct `allowFrom: ["*"]`.
    const sharedMembers = group.members["*"] ?? [];
    const channelMembers = params.channelId ? (group.members[params.channelId] ?? []) : [];
    expanded.push(...sharedMembers, ...channelMembers);
  }
  return expanded;
}

export function mergeDmAllowFromSources(params: {
  allowFrom?: Array<string | number>;
  storeAllowFrom?: Array<string | number>;
  dmPolicy?: string;
}): string[] {
  const storeEntries =
    params.dmPolicy === "allowlist" || params.dmPolicy === "open"
      ? []
      : (params.storeAllowFrom ?? []);
  return normalizeStringEntries([...(params.allowFrom ?? []), ...storeEntries]);
}

export function resolveGroupAllowFromSources(params: {
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  fallbackToAllowFrom?: boolean;
}): string[] {
  const explicitGroupAllowFrom =
    Array.isArray(params.groupAllowFrom) && params.groupAllowFrom.length > 0
      ? params.groupAllowFrom
      : undefined;
  const scoped = explicitGroupAllowFrom
    ? explicitGroupAllowFrom
    : params.fallbackToAllowFrom === false
      ? []
      : (params.allowFrom ?? []);
  return normalizeStringEntries(scoped);
}

export function firstDefined<T>(...values: Array<T | undefined>) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function isSenderIdAllowed(
  allow: { entries: string[]; hasWildcard: boolean; hasEntries: boolean },
  senderId: string | undefined,
  allowWhenEmpty: boolean,
): boolean {
  if (!allow.hasEntries) {
    return allowWhenEmpty;
  }
  if (allow.hasWildcard) {
    return true;
  }
  if (!senderId) {
    return false;
  }
  return allow.entries.includes(senderId);
}
