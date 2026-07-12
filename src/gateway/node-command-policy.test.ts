import { describe, expect, it } from "vitest";
import { normalizeDeclaredNodeCommands, resolveNodeIdFromConnect } from "./node-command-policy.js";
import type { ConnectParams } from "./protocol/index.js";

function makeConnectParams(overrides: {
  clientId?: ConnectParams["client"]["id"];
  deviceId?: string;
}): ConnectParams {
  return {
    minProtocol: 1,
    maxProtocol: 1,
    client: {
      id: overrides.clientId ?? "remoteclaw-macos",
      version: "1.0.0",
      platform: "darwin",
      mode: "node",
    },
    ...(overrides.deviceId !== undefined
      ? {
          device: {
            id: overrides.deviceId,
            publicKey: "public-key",
            signature: "signature",
            signedAt: 1,
            nonce: "nonce",
          },
        }
      : {}),
  };
}

describe("gateway/node-command-policy", () => {
  it("normalizes declared node commands against the allowlist", () => {
    const allowlist = new Set(["canvas.snapshot", "system.run"]);
    expect(
      normalizeDeclaredNodeCommands({
        declaredCommands: [" canvas.snapshot ", "", "system.run", "system.run", "screen.record"],
        allowlist,
      }),
    ).toEqual(["canvas.snapshot", "system.run"]);
  });

  describe("resolveNodeIdFromConnect", () => {
    it("uses the device id as the pairing key when a device identity is present", () => {
      expect(
        resolveNodeIdFromConnect(
          makeConnectParams({ clientId: "remoteclaw-macos", deviceId: "device-abc" }),
        ),
      ).toBe("device-abc");
    });

    it("falls back to the client id when no device identity is present", () => {
      expect(resolveNodeIdFromConnect(makeConnectParams({ clientId: "remoteclaw-macos" }))).toBe(
        "remoteclaw-macos",
      );
    });

    // Locks the nullish-coalescing (`??`) semantics of this security-relevant key against a
    // future `??` → `||` regression: a present-but-empty device id is non-nullish, so it wins
    // over the client id. Empty ids are `NonEmptyString`-rejected at the connect boundary, so
    // this input is unreachable at runtime — the assertion is defense-in-depth for the operator.
    it("keeps a present device id under nullish-coalescing even when it is empty", () => {
      expect(
        resolveNodeIdFromConnect(makeConnectParams({ clientId: "remoteclaw-macos", deviceId: "" })),
      ).toBe("");
    });
  });
});
