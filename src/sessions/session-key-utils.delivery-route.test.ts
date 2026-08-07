// Delivery-route parsing pins BOTH session-key grammars and the collision
// between them (remoteclaw/remoteclaw#3139): `parts[2]` is the DM marker in the
// 4-segment account-scoped grammar but the first peer-id segment in the
// 3-segment one, so a channel-kind peer whose id starts with `direct:`/`dm:`
// used to be re-parsed as a DM with the peer-kind token lifted into accountId.
import { describe, expect, it } from "vitest";
import { buildAgentPeerSessionKey } from "../routing/session-key.js";
import { parseSessionDeliveryRoute } from "./session-key-utils.js";

describe("parseSessionDeliveryRoute — 3-segment grammar {channel}:{peerKind}:{peerId}", () => {
  it("parses every peer kind", () => {
    expect(parseSessionDeliveryRoute("agent:main:slack:channel:c123")).toEqual({
      channel: "slack",
      peerId: "c123",
      peerKind: "channel",
    });
    expect(parseSessionDeliveryRoute("agent:main:slack:group:g123")).toEqual({
      channel: "slack",
      peerId: "g123",
      peerKind: "group",
    });
    expect(parseSessionDeliveryRoute("agent:main:slack:direct:u123")).toEqual({
      channel: "slack",
      peerId: "u123",
      peerKind: "direct",
    });
    expect(parseSessionDeliveryRoute("agent:main:slack:dm:u123")).toEqual({
      channel: "slack",
      peerId: "u123",
      peerKind: "dm",
    });
  });

  it("keeps colons inside an opaque peer id (Matrix room)", () => {
    expect(
      parseSessionDeliveryRoute("agent:main:matrix:channel:!MixedRoomAbCdEf:example.org"),
    ).toEqual({
      channel: "matrix",
      peerId: "!MixedRoomAbCdEf:example.org",
      peerKind: "channel",
    });
  });

  it("splits off a thread suffix", () => {
    expect(parseSessionDeliveryRoute("agent:main:slack:channel:c123:thread:t9")).toEqual({
      channel: "slack",
      peerId: "c123",
      peerKind: "channel",
      threadId: "t9",
    });
  });

  it("rejects an unknown peer kind", () => {
    expect(parseSessionDeliveryRoute("agent:main:slack:bogus:c123")).toBeNull();
  });
});

describe("parseSessionDeliveryRoute — 4-segment grammar {channel}:{accountId}:{direct|dm}:{peerId}", () => {
  it("parses an account-scoped DM for both markers", () => {
    expect(parseSessionDeliveryRoute("agent:main:slack:acct-1:direct:u123")).toEqual({
      accountId: "acct-1",
      channel: "slack",
      peerId: "u123",
      peerKind: "direct",
    });
    expect(parseSessionDeliveryRoute("agent:main:slack:acct-1:dm:u123")).toEqual({
      accountId: "acct-1",
      channel: "slack",
      peerId: "u123",
      peerKind: "dm",
    });
  });

  // The grammar has a real producer, so the branch cannot simply be deleted:
  // buildAgentPeerSessionKey emits exactly this shape under
  // `session.dmScope: "per-account-channel-peer"` (src/routing/session-key.ts).
  it("round-trips the per-account-channel-peer builder output", () => {
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "main",
      channel: "slack",
      accountId: "acct-1",
      peerKind: "direct",
      peerId: "U123",
      dmScope: "per-account-channel-peer",
    });
    expect(sessionKey).toBe("agent:main:slack:acct-1:direct:u123");
    expect(parseSessionDeliveryRoute(sessionKey)).toEqual({
      accountId: "acct-1",
      channel: "slack",
      peerId: "u123",
      peerKind: "direct",
    });
  });

  it("carries a thread suffix on the account-scoped form", () => {
    expect(parseSessionDeliveryRoute("agent:main:slack:acct-1:direct:u123:thread:t9")).toEqual({
      accountId: "acct-1",
      channel: "slack",
      peerId: "u123",
      peerKind: "direct",
      threadId: "t9",
    });
  });
});

describe("parseSessionDeliveryRoute — grammar collision (#3139)", () => {
  // Both readings are structurally valid and nothing in the key distinguishes
  // them, so the parser fails closed instead of guessing. Account ids are
  // free-form (`/^[a-z0-9][a-z0-9_-]{0,63}$/i`), so an account literally named
  // `channel`/`group`/`direct`/`dm` is representable — the ambiguity is real in
  // both directions, not merely hypothetical.
  it("does not lift the peer-kind token into accountId for a `direct:`-prefixed peer id", () => {
    expect(parseSessionDeliveryRoute("agent:main:slack:channel:direct:C123")).toBeNull();
  });

  it("does the same for a `dm:`-prefixed peer id", () => {
    expect(parseSessionDeliveryRoute("agent:main:slack:channel:dm:C123")).toBeNull();
  });

  it("covers every peer-kind token in the accountId position", () => {
    for (const ambiguous of [
      "agent:main:slack:group:direct:g1",
      "agent:main:slack:direct:direct:u1",
      "agent:main:slack:dm:dm:u1",
      "agent:main:slack:channel:direct:c1:thread:t9",
    ]) {
      expect(parseSessionDeliveryRoute(ambiguous)).toBeNull();
    }
  });

  it("still parses an account-scoped DM whose accountId is not a peer kind", () => {
    // The guard is scoped to the genuinely ambiguous case only.
    expect(parseSessionDeliveryRoute("agent:main:slack:channels:direct:u1")).toEqual({
      accountId: "channels",
      channel: "slack",
      peerId: "u1",
      peerKind: "direct",
    });
  });
});
