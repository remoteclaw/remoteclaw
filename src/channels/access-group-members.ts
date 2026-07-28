/**
 * Shared own-key reader for `message.senders` access-group member buckets.
 *
 * Two call sites expand `accessGroup:` references into concrete sender entries —
 * the ingress kernel (`message-access/state.ts` `groupSenderEntries`) and the
 * simple-matcher path (`allow-from.ts` `expandAccessGroupAllowFromEntries`) —
 * and they are documented as mirrors of each other. The lookup lives here so a
 * hardening applied to one cannot silently miss the other.
 *
 * `members` is a plain record keyed by channel id, and channel ids are an open
 * `string` (plugin-provided channels supply their own). A key like `__proto__`
 * or `constructor` would otherwise resolve to a value inherited from
 * `Object.prototype` — truthy, so `??` never fires — and spreading that
 * non-iterable value throws. Own-key array lookups behave exactly as before.
 */
export function readAccessGroupMembers(
  members: Record<string, unknown>,
  key: string,
): readonly string[] {
  if (!Object.hasOwn(members, key)) {
    return [];
  }
  const value = members[key];
  return Array.isArray(value) ? (value as string[]) : [];
}
