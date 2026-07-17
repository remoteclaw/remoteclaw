import { describe, expect, it } from "vitest";
import type { AccessGroupsConfig } from "../config/types.access-groups.js";
import {
  expandAccessGroupAllowFromEntries,
  firstDefined,
  isSenderIdAllowed,
  mergeDmAllowFromSources,
  resolveGroupAllowFromSources,
} from "./allow-from.js";

describe("mergeDmAllowFromSources", () => {
  it("merges, trims, and filters empty values", () => {
    expect(
      mergeDmAllowFromSources({
        allowFrom: ["  line:user:abc  ", "", 123],
        storeAllowFrom: ["   ", "telegram:456"],
      }),
    ).toEqual(["line:user:abc", "123", "telegram:456"]);
  });

  it.each([
    {
      name: "excludes pairing-store entries when dmPolicy is allowlist",
      input: {
        allowFrom: ["+1111"],
        storeAllowFrom: ["+2222", "+3333"],
        dmPolicy: "allowlist" as const,
      },
      expected: ["+1111"],
    },
    {
      name: "keeps pairing-store entries for non-allowlist policies",
      input: {
        allowFrom: ["+1111"],
        storeAllowFrom: ["+2222"],
        dmPolicy: "pairing" as const,
      },
      expected: ["+1111", "+2222"],
    },
  ])("$name", ({ input, expected }) => {
    expect(mergeDmAllowFromSources(input)).toEqual(expected);
  });
});

describe("resolveGroupAllowFromSources", () => {
  it("prefers explicit group allowlist", () => {
    expect(
      resolveGroupAllowFromSources({
        allowFrom: ["owner"],
        groupAllowFrom: ["group-owner", " group-admin "],
      }),
    ).toEqual(["group-owner", "group-admin"]);
  });

  it("falls back to DM allowlist when group allowlist is unset/empty", () => {
    expect(
      resolveGroupAllowFromSources({
        allowFrom: [" owner ", "", "owner2"],
        groupAllowFrom: [],
      }),
    ).toEqual(["owner", "owner2"]);
  });

  it("can disable fallback to DM allowlist", () => {
    expect(
      resolveGroupAllowFromSources({
        allowFrom: ["owner", "owner2"],
        groupAllowFrom: [],
        fallbackToAllowFrom: false,
      }),
    ).toStrictEqual([]);
  });
});

describe("expandAccessGroupAllowFromEntries", () => {
  const accessGroups: AccessGroupsConfig = {
    Ops: {
      type: "message.senders",
      members: { "*": ["ops-shared-id"], "chan-1": ["ops-chan1-id"] },
    },
    // A dynamic group type is not resolvable from static config on this path.
    Viewers: {
      type: "discord.channelAudience",
      guildId: "g1",
      channelId: "c1",
    },
  };

  it("passes non-access-group entries through unchanged", () => {
    expect(
      expandAccessGroupAllowFromEntries({ entries: ["user-1", "*", 42], accessGroups }),
    ).toEqual(["user-1", "*", "42"]);
  });

  it("expands a static message.senders reference to its shared + channel-scoped members", () => {
    expect(
      expandAccessGroupAllowFromEntries({
        entries: ["accessGroup:Ops"],
        accessGroups,
        channelId: "chan-1",
      }),
    ).toEqual(["ops-shared-id", "ops-chan1-id"]);
  });

  it("includes only shared members when no channelId is supplied", () => {
    expect(
      expandAccessGroupAllowFromEntries({ entries: ["accessGroup:Ops"], accessGroups }),
    ).toEqual(["ops-shared-id"]);
  });

  it("keeps direct entries alongside expanded members", () => {
    expect(
      expandAccessGroupAllowFromEntries({
        entries: ["direct-id", "accessGroup:Ops"],
        accessGroups,
        channelId: "chan-2",
      }),
    ).toEqual(["direct-id", "ops-shared-id"]);
  });

  it("drops references to missing groups (fail-closed)", () => {
    expect(
      expandAccessGroupAllowFromEntries({ entries: ["accessGroup:Nope"], accessGroups }),
    ).toEqual([]);
  });

  it("drops references to unsupported dynamic group types (fail-closed)", () => {
    expect(
      expandAccessGroupAllowFromEntries({ entries: ["accessGroup:Viewers"], accessGroups }),
    ).toEqual([]);
  });

  it("does not recurse into a nested access-group member (returns the literal)", () => {
    const nested: AccessGroupsConfig = {
      Outer: { type: "message.senders", members: { "*": ["accessGroup:Inner"] } },
      Inner: { type: "message.senders", members: { "*": ["inner-id"] } },
    };
    expect(
      expandAccessGroupAllowFromEntries({ entries: ["accessGroup:Outer"], accessGroups: nested }),
    ).toEqual(["accessGroup:Inner"]);
  });

  it("drops all references when accessGroups is absent (unexpanded, fail-closed)", () => {
    expect(expandAccessGroupAllowFromEntries({ entries: ["accessGroup:Ops", "u1"] })).toEqual([
      "u1",
    ]);
  });
});

describe("firstDefined", () => {
  it("returns the first non-undefined value", () => {
    expect(firstDefined(undefined, undefined, "x", "y")).toBe("x");
    expect(firstDefined(undefined, 0, 1)).toBe(0);
  });
});

describe("isSenderIdAllowed", () => {
  it("supports per-channel empty-list defaults and wildcard/id matches", () => {
    expect(
      isSenderIdAllowed(
        {
          entries: [],
          hasEntries: false,
          hasWildcard: false,
        },
        "123",
        true,
      ),
    ).toBe(true);
    expect(
      isSenderIdAllowed(
        {
          entries: [],
          hasEntries: false,
          hasWildcard: false,
        },
        "123",
        false,
      ),
    ).toBe(false);
    expect(
      isSenderIdAllowed(
        {
          entries: ["111", "222"],
          hasEntries: true,
          hasWildcard: true,
        },
        undefined,
        false,
      ),
    ).toBe(true);
    expect(
      isSenderIdAllowed(
        {
          entries: ["111", "222"],
          hasEntries: true,
          hasWildcard: false,
        },
        "222",
        false,
      ),
    ).toBe(true);
  });
});
