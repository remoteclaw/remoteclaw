import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { sendGatewayAuthFailure } from "./http-common.js";
import {
  type AuthorizedGatewayHttpRequest,
  getBearerToken,
  getHeader,
  resolveHttpBrowserOriginPolicy,
  usesSharedSecretGatewayMethod,
} from "./http-utils.js";
import { CLI_DEFAULT_OPERATOR_SCOPES } from "./method-scopes.js";

const OPERATOR_SCOPES_HEADER = "x-remoteclaw-scopes";

export async function authorizeGatewayBearerRequestOrReply(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
}): Promise<boolean> {
  const token = getBearerToken(params.req);
  const browserOriginPolicy = resolveHttpBrowserOriginPolicy(params.req);
  const authResult = await authorizeHttpGatewayConnect({
    auth: params.auth,
    connectAuth: token ? { token, password: token } : null,
    req: params.req,
    trustedProxies: params.trustedProxies,
    allowRealIpFallback: params.allowRealIpFallback,
    rateLimiter: params.rateLimiter,
    browserOriginPolicy,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(params.res, authResult);
    return false;
  }
  return true;
}

/**
 * Like `authorizeGatewayBearerRequestOrReply`, but surfaces the satisfying auth
 * context instead of a bare boolean (#2735). Endpoints that derive per-request
 * authority — operator scopes / owner — from the auth method (e.g. the
 * OpenAI-compatible surface) need this; `authorizeGatewayBearerRequestOrReply`
 * is retained for callers that only need allow/deny (e.g. `tools-invoke-http`).
 *
 * Returns `null` (and writes the auth-failure response) when unauthorized, so
 * callers branch on truthiness exactly as before.
 */
export async function authorizeGatewayHttpRequestOrReply(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
}): Promise<AuthorizedGatewayHttpRequest | null> {
  const token = getBearerToken(params.req);
  const browserOriginPolicy = resolveHttpBrowserOriginPolicy(params.req);
  const authResult = await authorizeHttpGatewayConnect({
    auth: params.auth,
    connectAuth: token ? { token, password: token } : null,
    req: params.req,
    trustedProxies: params.trustedProxies,
    allowRealIpFallback: params.allowRealIpFallback,
    rateLimiter: params.rateLimiter,
    browserOriginPolicy,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(params.res, authResult);
    return null;
  }
  return {
    authMethod: authResult.method,
    // Shared-secret bearer auth proves possession of the gateway secret, not a
    // narrower per-request operator identity, so its DECLARED scopes are NOT
    // trusted (owner is granted via the compat short-circuit instead). Non-
    // shared-secret callers (none / trusted-proxy) may have their declared
    // scopes honored — but a missing or non-admin declaration is NOT owner
    // (#2735; see resolveTrustedHttpOperatorScopes for the fork divergence).
    trustDeclaredOperatorScopes: !usesSharedSecretGatewayMethod(authResult.method),
  };
}

export function resolveGatewayRequestedOperatorScopes(req: IncomingMessage): string[] {
  const raw = getHeader(req, OPERATOR_SCOPES_HEADER)?.trim();
  if (raw === undefined) {
    // No x-remoteclaw-scopes header present at all: the caller is a plain
    // Bearer-token HTTP client (curl, OpenAI SDK, etc.) that has already
    // passed gateway token authentication.  Grant the same default operator
    // scopes that the CLI and other first-party callers receive so that
    // authenticated HTTP requests are not denied by the method-scope gate.
    //
    // When the header IS present (even if empty), honour the declared value
    // so that callers can voluntarily restrict their own privilege set and
    // the CVE-2026-32919 / CVE-2026-28473 security boundary is preserved.
    return [...CLI_DEFAULT_OPERATOR_SCOPES];
  }
  if (!raw) {
    // Header present but empty string → caller explicitly declared no scopes.
    return [];
  }
  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}
