import { describe, expect, it } from "vitest";
import { resolveDiscordDmCommandAccess } from "./dm-command-auth.js";

describe("resolveDiscordDmCommandAccess", () => {
  const sender = {
    id: "123",
    name: "alice",
    tag: "alice#0001",
  };

  async function resolveOpenDmAccess(configuredAllowFrom: string[]) {
    return await resolveDiscordDmCommandAccess({
      accountId: "default",
      dmPolicy: "open",
      configuredAllowFrom,
      sender,
      allowNameMatching: false,
      useAccessGroups: true,
      readStoreAllowFrom: async () => [],
    });
  }

  it("blocks open DMs without allowlist entries (hardened fail-closed)", async () => {
    const result = await resolveOpenDmAccess([]);

    // dmPolicy=open with an empty allowFrom now fails closed (blocks) rather than
    // allowing all senders; command auth is consequently not granted.
    expect(result.decision).toBe("block");
    expect(result.commandAuthorized).toBe(false);
  });

  it("marks command auth true when sender is allowlisted", async () => {
    const result = await resolveOpenDmAccess(["discord:123"]);

    expect(result.decision).toBe("allow");
    expect(result.commandAuthorized).toBe(true);
  });

  it("blocks open DMs when configured allowlist does not match the sender (hardened)", async () => {
    const result = await resolveDiscordDmCommandAccess({
      accountId: "default",
      dmPolicy: "open",
      configuredAllowFrom: ["discord:999"],
      sender,
      allowNameMatching: false,
      useAccessGroups: true,
      readStoreAllowFrom: async () => [],
    });

    // open + a configured allowlist the sender is not on now blocks (allowlist wins).
    expect(result.decision).toBe("block");
    expect(result.allowMatch.allowed).toBe(false);
    expect(result.commandAuthorized).toBe(false);
  });

  it("returns pairing decision and unauthorized command auth for unknown senders", async () => {
    const result = await resolveDiscordDmCommandAccess({
      accountId: "default",
      dmPolicy: "pairing",
      configuredAllowFrom: ["discord:456"],
      sender,
      allowNameMatching: false,
      useAccessGroups: true,
      readStoreAllowFrom: async () => [],
    });

    expect(result.decision).toBe("pairing");
    expect(result.commandAuthorized).toBe(false);
  });

  it("authorizes sender from pairing-store allowlist entries", async () => {
    const result = await resolveDiscordDmCommandAccess({
      accountId: "default",
      dmPolicy: "pairing",
      configuredAllowFrom: [],
      sender,
      allowNameMatching: false,
      useAccessGroups: true,
      readStoreAllowFrom: async () => ["discord:123"],
    });

    expect(result.decision).toBe("allow");
    expect(result.commandAuthorized).toBe(true);
  });

  it("blocks open DMs without allowlist even when access groups are disabled (hardened)", async () => {
    const result = await resolveDiscordDmCommandAccess({
      accountId: "default",
      dmPolicy: "open",
      configuredAllowFrom: [],
      sender,
      allowNameMatching: false,
      useAccessGroups: false,
      readStoreAllowFrom: async () => [],
    });

    // The DM-access hardening blocks open + empty allowFrom regardless of the
    // access-groups toggle — this is the operative security outcome.
    expect(result.decision).toBe("block");
    // commandAuthorized is a separate, unchanged axis: with access groups off and no
    // allowlist configured it stays true (legacy "no allowlist ⇒ commands open"), but it
    // is moot here because the DM is blocked before any command is processed.
    expect(result.commandAuthorized).toBe(true);
  });
});
