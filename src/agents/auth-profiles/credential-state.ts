import type { AuthProfileCredential } from "./types.js";

export type AuthCredentialReasonCode = "ok" | "missing_credential" | "invalid_expires" | "expired";

export type TokenExpiryState = "missing" | "valid" | "expired" | "invalid_expires";

export function resolveTokenExpiryState(expires: unknown, now = Date.now()): TokenExpiryState {
  if (expires === undefined) {
    return "missing";
  }
  if (typeof expires !== "number") {
    return "invalid_expires";
  }
  if (!Number.isFinite(expires) || expires <= 0) {
    return "invalid_expires";
  }
  return now >= expires ? "expired" : "valid";
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateStoredCredentialEligibility(params: {
  credential: AuthProfileCredential;
  now?: number;
}): {
  eligible: boolean;
  reasonCode: AuthCredentialReasonCode;
} {
  const now = params.now ?? Date.now();
  const credential = params.credential;

  if (credential.type === "api_key") {
    if (!hasNonEmptyString(credential.key)) {
      return { eligible: false, reasonCode: "missing_credential" };
    }
    return { eligible: true, reasonCode: "ok" };
  }

  if (credential.type === "token") {
    if (!hasNonEmptyString(credential.token)) {
      return { eligible: false, reasonCode: "missing_credential" };
    }

    const expiryState = resolveTokenExpiryState(credential.expires, now);
    if (expiryState === "invalid_expires") {
      return { eligible: false, reasonCode: "invalid_expires" };
    }
    if (expiryState === "expired") {
      return { eligible: false, reasonCode: "expired" };
    }
    return { eligible: true, reasonCode: "ok" };
  }

  if (!hasNonEmptyString(credential.access) && !hasNonEmptyString(credential.refresh)) {
    return { eligible: false, reasonCode: "missing_credential" };
  }
  return { eligible: true, reasonCode: "ok" };
}
