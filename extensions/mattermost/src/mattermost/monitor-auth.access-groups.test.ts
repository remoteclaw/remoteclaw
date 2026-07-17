import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/mattermost";
import { describe, expect, it } from "vitest";
import { isMattermostSenderAllowed } from "./monitor-auth.js";

// Necropsy regression for #2982: `accessGroup:<name>` allowlist entries must expand to their
// configured members at the Mattermost admit seam. These tests exercise the REAL matcher
// (`resolveAllowlistMatchSimple` is NOT mocked here, unlike monitor-auth.test.ts), so reverting the
// expansion turns "admits a member" red — the discriminating signal against the pre-fix corpse,
// where an `accessGroup:` reference reached the literal matcher as an inert token and denied every
// member (fail-closed).
describe("mattermost access-group allowlist resolution (#2982)", () => {
  const accessGroups: RemoteClawConfig["accessGroups"] = {
    Ops: {
      type: "message.senders",
      members: { "*": ["ops-user-id"], "chan-1": ["ops-chan1-id"] },
    },
  };

  it("admits a member of an allowlisted access group (corpse: pre-fix wrongly denied)", () => {
    expect(
      isMattermostSenderAllowed({
        senderId: "ops-user-id",
        senderName: "Alice Ops",
        allowFrom: ["accessGroup:Ops"],
        accessGroups,
        channelId: "chan-1",
      }),
    ).toBe(true);
  });

  it("scopes channel-specific members to their channel", () => {
    expect(
      isMattermostSenderAllowed({
        senderId: "ops-chan1-id",
        allowFrom: ["accessGroup:Ops"],
        accessGroups,
        channelId: "chan-1",
      }),
    ).toBe(true);
    // The chan-1-scoped member is NOT a member from a different channel.
    expect(
      isMattermostSenderAllowed({
        senderId: "ops-chan1-id",
        allowFrom: ["accessGroup:Ops"],
        accessGroups,
        channelId: "chan-2",
      }),
    ).toBe(false);
  });

  it("denies a non-member (fail-closed, no over-admit)", () => {
    expect(
      isMattermostSenderAllowed({
        senderId: "outsider-id",
        senderName: "Outsider",
        allowFrom: ["accessGroup:Ops"],
        accessGroups,
        channelId: "chan-1",
      }),
    ).toBe(false);
  });

  it("matches on the non-spoofable sender id, not a spoofable display name", () => {
    // The attacker sets their display name to a member's stable id; their actual id differs. With
    // dangerous name-matching OFF (the default), only the id is compared → denied. This proves
    // member expansion did not trade the original fail-closed gap for a display-name spoof.
    expect(
      isMattermostSenderAllowed({
        senderId: "attacker-id",
        senderName: "ops-user-id",
        allowFrom: ["accessGroup:Ops"],
        accessGroups,
        channelId: "chan-1",
        allowNameMatching: false,
      }),
    ).toBe(false);
  });

  it("still honours direct entries mixed with an access-group reference", () => {
    expect(
      isMattermostSenderAllowed({
        senderId: "direct-user",
        allowFrom: ["direct-user", "accessGroup:Ops"],
        accessGroups,
        channelId: "chan-1",
      }),
    ).toBe(true);
  });

  it("admits a name-listed member only when dangerous name-matching is enabled (parity with direct entries)", () => {
    const namedGroup: RemoteClawConfig["accessGroups"] = {
      Ops: { type: "message.senders", members: { "*": ["alice"] } },
    };
    // The member is written as a username, and the sender's id differs from it. This admits ONLY
    // when the operator has opted into dangerous name-matching — identical to a direct entry, so
    // member expansion introduces no name-match behavior of its own.
    const params = {
      senderId: "u-123",
      senderName: "Alice",
      allowFrom: ["accessGroup:Ops"] as string[],
      accessGroups: namedGroup,
      channelId: "chan-1",
    };
    expect(isMattermostSenderAllowed({ ...params, allowNameMatching: false })).toBe(false);
    expect(isMattermostSenderAllowed({ ...params, allowNameMatching: true })).toBe(true);
  });

  it("leaves an access-group reference inert when no group config is supplied (unchanged fail-closed)", () => {
    expect(
      isMattermostSenderAllowed({
        senderId: "ops-user-id",
        allowFrom: ["accessGroup:Ops"],
      }),
    ).toBe(false);
  });
});
