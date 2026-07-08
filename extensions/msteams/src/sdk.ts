import type { MSTeamsAdapter } from "./messenger.js";
import type { MSTeamsCredentials } from "./token.js";

export type MSTeamsSdk = typeof import("@microsoft/agents-hosting");
export type MSTeamsAuthConfig = ReturnType<MSTeamsSdk["getAuthConfigWithDefaults"]>;

export async function loadMSTeamsSdk(): Promise<MSTeamsSdk> {
  return await import("@microsoft/agents-hosting");
}

export function buildMSTeamsAuthConfig(
  creds: MSTeamsCredentials,
  sdk: MSTeamsSdk,
): MSTeamsAuthConfig {
  return sdk.getAuthConfigWithDefaults({
    clientId: creds.appId,
    clientSecret: creds.appPassword,
    tenantId: creds.tenantId,
  });
}

export function createMSTeamsAdapter(
  authConfig: MSTeamsAuthConfig,
  sdk: MSTeamsSdk,
): MSTeamsAdapter {
  return new sdk.CloudAdapter(authConfig) as unknown as MSTeamsAdapter;
}

export async function loadMSTeamsSdkWithAuth(creds: MSTeamsCredentials) {
  const sdk = await loadMSTeamsSdk();
  const authConfig = buildMSTeamsAuthConfig(creds, sdk);
  return { sdk, authConfig };
}

/**
 * Return true when the error originated from a network-level failure fetching
 * the JWKS endpoint (DNS resolution, connection refused, TLS handshake, etc.)
 * rather than from token verification logic.
 */
function isJwksNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const code = (err as NodeJS.ErrnoException).code;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET"
  ) {
    return true;
  }
  // jwks-rsa wraps fetch failures with a message containing the URL or "key fetching"
  return (
    /jwks|key fetch|getSigningKey/i.test(err.message) && /network|fetch|connect/i.test(err.message)
  );
}
