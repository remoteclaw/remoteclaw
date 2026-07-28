// Access-group member reads must not inherit from Object.prototype.
//
// Fork-owned coverage: `src/channels/message-access/message-access.test.ts` is a
// verbatim upstream port kept byte-identical for re-sync, so the guard this fork
// added (#2861) is pinned here instead. Channel ids became an open `string` when
// plugin-provided channels started reaching the ingress kernel, which is what
// makes a prototype-named key reachable at all.
import { describe, expect, it } from "vitest";
import { readAccessGroupMembers } from "./access-group-members.js";
import { expandAccessGroupAllowFromEntries } from "./allow-from.js";
import {
  type InternalChannelIngressAdapter,
  resolveChannelIngressState,
} from "./message-access/index.js";

const dangerousKeys = ["__proto__", "constructor", "prototype", "toString"];

describe("readAccessGroupMembers", () => {
  it("returns own-key arrays unchanged", () => {
    const members = { "*": ["usr_shared"], clickclack: ["usr_scoped"] };

    expect(readAccessGroupMembers(members, "*")).toEqual(["usr_shared"]);
    expect(readAccessGroupMembers(members, "clickclack")).toEqual(["usr_scoped"]);
  });

  it("returns empty for a missing key", () => {
    expect(readAccessGroupMembers({ "*": ["usr_shared"] }, "telegram")).toEqual([]);
  });

  it("returns empty for prototype-inherited keys instead of leaking or throwing", () => {
    const members: Record<string, unknown> = { "*": ["usr_shared"] };

    for (const key of dangerousKeys) {
      expect(() => readAccessGroupMembers(members, key), `key ${key} must not throw`).not.toThrow();
      expect(readAccessGroupMembers(members, key), `key ${key} must not leak`).toEqual([]);
    }
  });

  it("returns empty when an own key holds a non-array value", () => {
    const members = { clickclack: "usr_scoped" } as unknown as Record<string, unknown>;

    expect(readAccessGroupMembers(members, "clickclack")).toEqual([]);
  });

  it("still honors an own key that happens to be named like a prototype member", () => {
    // An object literal makes `constructor` an OWN property, which is the case
    // the guard must still admit — it filters inherited keys, not this name.
    const members = { constructor: ["usr_legit"] } as unknown as Record<string, unknown>;

    expect(readAccessGroupMembers(members, "constructor")).toEqual(["usr_legit"]);
  });
});

describe("access-group expansion with a prototype-named channel id", () => {
  const accessGroups = {
    owners: { type: "message.senders", members: { "*": ["usr_shared"] } },
  } as unknown as Parameters<typeof expandAccessGroupAllowFromEntries>[0]["accessGroups"];

  it("expands shared members without inheriting for allow-from", () => {
    for (const channelId of dangerousKeys) {
      const entries = expandAccessGroupAllowFromEntries({
        entries: ["accessGroup:owners"],
        accessGroups,
        channelId,
      });

      expect(entries, `channelId ${channelId}`).toEqual(["usr_shared"]);
    }
  });

  it("resolves ingress state without throwing for the ingress kernel", async () => {
    const adapter: InternalChannelIngressAdapter = {
      normalizeEntries({ entries }) {
        return {
          matchable: entries.map((entry, index) => ({
            opaqueEntryId: `entry-${index + 1}`,
            kind: "stable-id",
            value: entry,
          })),
          invalid: [],
          disabled: [],
        };
      },
      matchSubject({ subject, entries }) {
        const values = new Set(subject.identifiers.map((identifier) => identifier.value));
        const matchedEntryIds = entries
          .filter((entry) => values.has(entry.value))
          .map((entry) => entry.opaqueEntryId);
        return { matched: matchedEntryIds.length > 0, matchedEntryIds };
      },
    };

    for (const channelId of dangerousKeys) {
      const state = await resolveChannelIngressState({
        channelId,
        accountId: "default",
        subject: {
          identifiers: [{ opaqueId: "subject-1", kind: "stable-id", value: "usr_shared" }],
        },
        conversation: { kind: "group", id: "chn_1" },
        adapter,
        event: { kind: "message", authMode: "inbound", mayPair: false },
        allowlists: { group: ["accessGroup:owners"] },
        accessGroups,
      } as unknown as Parameters<typeof resolveChannelIngressState>[0]);

      // The shared `members["*"]` bucket still expands and matches the sender;
      // nothing is inherited from Object.prototype for the prototype-named
      // channel id, and no channel-scoped bucket is fabricated for it.
      expect(state.allowlists.group.matchedEntryIds, `channelId ${channelId}`).toHaveLength(1);
      expect(state.allowlists.group.accessGroups.matched, `channelId ${channelId}`).toEqual([
        "owners",
      ]);
    }
  });
});
