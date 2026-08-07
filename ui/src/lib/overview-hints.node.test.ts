// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ConnectErrorDetailCodes } from "../../../src/gateway/protocol/connect-error-details.js";
import {
  resolveAuthHintKind,
  resolvePairingHint,
  shouldShowInsecureContextHint,
} from "./overview-hints.ts";

describe("resolvePairingHint", () => {
  it.each([
    ["close reason", "disconnected (1008): pairing required", undefined],
    ["case-insensitive close reason", "Pairing Required", undefined],
    [
      "structured pairing code",
      "disconnected (4008): connect failed",
      ConnectErrorDetailCodes.PAIRING_REQUIRED,
    ],
  ])("detects pairing required from %s", (_name, lastError, lastErrorCode) => {
    expect(resolvePairingHint(false, lastError, lastErrorCode)).toEqual({
      kind: "pairing-required",
      requestId: null,
    });
  });

  it.each([
    ["connected clients", true, "disconnected (1008): pairing required"],
    ["missing errors", false, null],
    ["unrelated errors", false, "disconnected (1006): no reason"],
    ["auth errors", false, "disconnected (4008): unauthorized"],
  ])("ignores %s", (_name, connected, lastError) => {
    expect(resolvePairingHint(connected, lastError)).toBeNull();
  });

  it("detects scope-upgrade pending approval and keeps the request id", () => {
    expect(
      resolvePairingHint(
        false,
        "scope upgrade pending approval (requestId: req-123)",
        ConnectErrorDetailCodes.PAIRING_REQUIRED,
      ),
    ).toEqual({
      kind: "scope-upgrade-pending",
      requestId: "req-123",
    });
  });
});

describe("resolveAuthHintKind", () => {
  it("returns required for structured auth-required codes", () => {
    expect(
      resolveAuthHintKind({
        connected: false,
        lastError: "disconnected (4008): connect failed",
        lastErrorCode: ConnectErrorDetailCodes.AUTH_TOKEN_MISSING,
        hasToken: false,
        hasPassword: false,
      }),
    ).toBe("required");
  });

  it("returns failed for structured auth mismatch codes", () => {
    expect(
      resolveAuthHintKind({
        connected: false,
        lastError: "disconnected (4008): connect failed",
        lastErrorCode: ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH,
        hasToken: true,
        hasPassword: false,
      }),
    ).toBe("failed");
  });

  it("does not treat generic connect failures as auth failures", () => {
    expect(
      resolveAuthHintKind({
        connected: false,
        lastError: "disconnected (4008): connect failed",
        lastErrorCode: ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED,
        hasToken: true,
        hasPassword: false,
      }),
    ).toBeNull();
  });

  it("falls back to unauthorized string matching without structured codes", () => {
    expect(
      resolveAuthHintKind({
        connected: false,
        lastError: "disconnected (4008): unauthorized",
        lastErrorCode: null,
        hasToken: true,
        hasPassword: false,
      }),
    ).toBe("failed");
  });
});

describe("shouldShowInsecureContextHint", () => {
  it("returns true for browser WebSocket security errors", () => {
    expect(
      shouldShowInsecureContextHint(
        false,
        "Browser refused the Gateway WebSocket for security reasons.",
        "BROWSER_WEBSOCKET_SECURITY_ERROR",
      ),
    ).toBe(true);
  });

  it("does not treat generic WebSocket constructor errors as insecure context", () => {
    expect(
      shouldShowInsecureContextHint(
        false,
        "Could not create the Gateway WebSocket: constructor failed",
        "BROWSER_WEBSOCKET_CONSTRUCTOR_ERROR",
      ),
    ).toBe(false);
  });
});
