import { describe, expect, it } from "vitest";
import {
  DEFAULT_OAUTH_REFRESH_MARGIN_MS,
  evaluateStoredCredentialEligibility,
  hasUsableOAuthCredential,
  resolveTokenExpiryState,
} from "./credential-state.js";

describe("resolveTokenExpiryState", () => {
  const now = 1_700_000_000_000;

  it("treats undefined as missing", () => {
    expect(resolveTokenExpiryState(undefined, now)).toBe("missing");
  });

  it("treats non-finite and non-positive values as invalid_expires", () => {
    expect(resolveTokenExpiryState(0, now)).toBe("invalid_expires");
    expect(resolveTokenExpiryState(-1, now)).toBe("invalid_expires");
    expect(resolveTokenExpiryState(Number.NaN, now)).toBe("invalid_expires");
    expect(resolveTokenExpiryState(Number.POSITIVE_INFINITY, now)).toBe("invalid_expires");
  });

  it("returns expired when expires is in the past", () => {
    expect(resolveTokenExpiryState(now - 1, now)).toBe("expired");
  });

  it("returns valid when expires is in the future", () => {
    expect(resolveTokenExpiryState(now + 1, now)).toBe("valid");
  });

  it("returns expiring when expires falls within the configured margin", () => {
    expect(
      resolveTokenExpiryState(now + DEFAULT_OAUTH_REFRESH_MARGIN_MS - 1, now, {
        expiringWithinMs: DEFAULT_OAUTH_REFRESH_MARGIN_MS,
      }),
    ).toBe("expiring");
  });
});

describe("hasUsableOAuthCredential", () => {
  const now = 1_700_000_000_000;

  it("treats near-expiry oauth credentials as no longer usable", () => {
    expect(
      hasUsableOAuthCredential(
        {
          type: "oauth",
          provider: "openai-codex",
          access: "access-token",
          refresh: "refresh-token",
          expires: now + DEFAULT_OAUTH_REFRESH_MARGIN_MS - 1,
        },
        { now },
      ),
    ).toBe(false);
  });
});

describe("evaluateStoredCredentialEligibility", () => {
  const now = 1_700_000_000_000;

  it("marks api_key with inline key as eligible", () => {
    const result = evaluateStoredCredentialEligibility({
      credential: {
        type: "api_key",
        provider: "anthropic",
        key: "sk-test",
      },
      now,
    });
    expect(result).toEqual({ eligible: true, reasonCode: "ok" });
  });

  it("marks api_key with missing key as ineligible", () => {
    const result = evaluateStoredCredentialEligibility({
      credential: {
        type: "api_key",
        provider: "anthropic",
      },
      now,
    });
    expect(result).toEqual({ eligible: false, reasonCode: "missing_credential" });
  });

  it("marks token with missing token as ineligible", () => {
    const result = evaluateStoredCredentialEligibility({
      credential: {
        type: "token",
        provider: "github-copilot",
      },
      now,
    });
    expect(result).toEqual({ eligible: false, reasonCode: "missing_credential" });
  });

  it("marks token with inline value and missing expires as eligible", () => {
    const result = evaluateStoredCredentialEligibility({
      credential: {
        type: "token",
        provider: "github-copilot",
        token: "tok",
      },
      now,
    });
    expect(result).toEqual({ eligible: true, reasonCode: "ok" });
  });

  it("marks token with invalid expires as ineligible", () => {
    const result = evaluateStoredCredentialEligibility({
      credential: {
        type: "token",
        provider: "github-copilot",
        token: "tok",
        expires: 0,
      },
      now,
    });
    expect(result).toEqual({ eligible: false, reasonCode: "invalid_expires" });
  });
});
