import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { type RemoteClawConfig, loadConfig } from "../config/config.js";
import { buildAgentMainSessionKey, normalizeAgentId } from "../routing/session-key.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../shared/string-coerce.js";
import { normalizeMessageChannel } from "../utils/message-channel.js";
import type { GatewayAuthResult, ResolvedGatewayAuth } from "./auth.js";
import { ADMIN_SCOPE, CLI_DEFAULT_OPERATOR_SCOPES } from "./method-scopes.js";

/** Header by which a non-shared-secret HTTP caller may declare its operator scopes. */
const OPERATOR_SCOPES_HEADER = "x-remoteclaw-scopes";

/** Brand model id that routes to the configured default agent. */
export const REMOTECLAW_MODEL_ID = "remoteclaw";
/** Brand model id (with explicit `/default` slug) that also routes to the configured default agent. */
export const REMOTECLAW_DEFAULT_MODEL_ID = "remoteclaw/default";

export function getHeader(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[normalizeLowercaseStringOrEmpty(name)];
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return undefined;
}

export function getBearerToken(req: IncomingMessage): string | undefined {
  const raw = normalizeOptionalString(getHeader(req, "authorization")) ?? "";
  if (!normalizeLowercaseStringOrEmpty(raw).startsWith("bearer ")) {
    return undefined;
  }
  return normalizeOptionalString(raw.slice(7));
}

export function resolveAgentIdFromHeader(req: IncomingMessage): string | undefined {
  const raw =
    normalizeOptionalString(getHeader(req, "x-remoteclaw-agent-id")) ||
    normalizeOptionalString(getHeader(req, "x-remoteclaw-agent")) ||
    "";
  if (!raw) {
    return undefined;
  }
  return normalizeAgentId(raw);
}

export function resolveAgentIdFromModel(
  model: string | undefined,
  cfg: RemoteClawConfig = loadConfig(),
): string | undefined {
  const raw = model?.trim();
  if (!raw) {
    return undefined;
  }
  // The bare brand id and the explicit `<brand>/default` slug both route to the
  // configured default agent (which is not necessarily named "default").
  const lowered = raw.toLowerCase();
  if (lowered === REMOTECLAW_MODEL_ID || lowered === REMOTECLAW_DEFAULT_MODEL_ID) {
    return resolveDefaultAgentId(cfg);
  }

  const m =
    raw.match(/^remoteclaw[:/](?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i) ??
    raw.match(/^agent:(?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i);
  const agentId = m?.groups?.agentId;
  if (!agentId) {
    return undefined;
  }
  return normalizeAgentId(agentId);
}

export function resolveAgentIdForRequest(params: {
  req: IncomingMessage;
  model: string | undefined;
  cfg?: RemoteClawConfig;
}): string {
  const fromHeader = resolveAgentIdFromHeader(params.req);
  if (fromHeader) {
    return fromHeader;
  }

  const cfg = params.cfg ?? loadConfig();
  const fromModel = resolveAgentIdFromModel(params.model, cfg);
  return fromModel ?? resolveDefaultAgentId(cfg);
}

export function resolveSessionKey(params: {
  req: IncomingMessage;
  agentId: string;
  user?: string | undefined;
  prefix: string;
}): string {
  const explicit = getHeader(params.req, "x-remoteclaw-session-key")?.trim();
  if (explicit) {
    return explicit;
  }

  const user = params.user?.trim();
  const mainKey = user ? `${params.prefix}-user:${user}` : `${params.prefix}:${randomUUID()}`;
  return buildAgentMainSessionKey({ agentId: params.agentId, mainKey });
}

export function resolveGatewayRequestContext(params: {
  req: IncomingMessage;
  model: string | undefined;
  user?: string | undefined;
  sessionPrefix: string;
  defaultMessageChannel: string;
  useMessageChannelHeader?: boolean;
}): { agentId: string; sessionKey: string; messageChannel: string } {
  const cfg = loadConfig();
  const agentId = resolveAgentIdForRequest({ req: params.req, model: params.model, cfg });
  const sessionKey = resolveSessionKey({
    req: params.req,
    agentId,
    user: params.user,
    prefix: params.sessionPrefix,
  });

  const messageChannel = params.useMessageChannelHeader
    ? (normalizeMessageChannel(getHeader(params.req, "x-remoteclaw-message-channel")) ??
      params.defaultMessageChannel)
    : params.defaultMessageChannel;

  return { agentId, sessionKey, messageChannel };
}

/**
 * Resolve the browser origin policy for an HTTP request.
 * Upstream feature stub — returns undefined (no policy enforced).
 */
export function resolveHttpBrowserOriginPolicy(
  _req: IncomingMessage,
): { origin?: string; allowed?: boolean } | undefined {
  return undefined;
}

// --- HTTP auth → operator-scope / owner derivation (#2735) -------------------
//
// Restores the dropped owner-authorization control on the OpenAI-compatible HTTP
// surface. `senderIsOwner` was hardcoded `true`, so an UNAUTHENTICATED caller on
// an `auth:"none"` gateway was handed owner-level MCP tool authority. These
// helpers derive operator scopes / owner from the *satisfying* gateway auth
// method instead. See `resolveTrustedHttpOperatorScopes` for the load-bearing
// fork-specific divergence from upstream.

/** Minimal auth shape used to detect shared-secret (token/password) HTTP auth. */
type SharedSecretGatewayAuth = Pick<ResolvedGatewayAuth, "mode">;

/**
 * The auth context that survives `handleGatewayPostJsonEndpoint`'s success path.
 * `authMethod` is the method that satisfied the gateway connect check;
 * `trustDeclaredOperatorScopes` is whether the caller's declared per-request
 * scopes (the `x-remoteclaw-scopes` header) may be honored — false for
 * shared-secret bearer auth, which proves possession of the gateway secret but
 * not a narrower per-request operator identity.
 */
export type AuthorizedGatewayHttpRequest = {
  authMethod?: GatewayAuthResult["method"];
  trustDeclaredOperatorScopes: boolean;
};

/** Shared-secret gateway methods (token / password bearer). */
export function usesSharedSecretGatewayMethod(
  method: GatewayAuthResult["method"] | undefined,
): boolean {
  return method === "token" || method === "password";
}

function usesSharedSecretHttpAuth(auth: SharedSecretGatewayAuth | undefined): boolean {
  return auth?.mode === "token" || auth?.mode === "password";
}

/** A bearer-token request against a shared-secret-configured gateway. */
export function isGatewayBearerHttpRequest(
  req: IncomingMessage,
  auth?: SharedSecretGatewayAuth,
): boolean {
  return usesSharedSecretHttpAuth(auth) && Boolean(getBearerToken(req));
}

function shouldTrustDeclaredHttpOperatorScopes(
  req: IncomingMessage,
  authOrRequest:
    | SharedSecretGatewayAuth
    | Pick<AuthorizedGatewayHttpRequest, "trustDeclaredOperatorScopes">
    | undefined,
): boolean {
  if (authOrRequest && "trustDeclaredOperatorScopes" in authOrRequest) {
    return authOrRequest.trustDeclaredOperatorScopes;
  }
  return !isGatewayBearerHttpRequest(req, authOrRequest);
}

/**
 * Parse the caller's explicitly declared operator scopes from the
 * `x-remoteclaw-scopes` header. Returns `undefined` when the header is absent
 * (no declaration), `[]` when present-but-empty (caller declared "no scopes"),
 * or the parsed list otherwise.
 */
function parseDeclaredHttpOperatorScopes(req: IncomingMessage): string[] | undefined {
  const headerValue = getHeader(req, OPERATOR_SCOPES_HEADER);
  if (headerValue === undefined) {
    return undefined;
  }
  const raw = headerValue.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

/**
 * Operator scopes used to derive OWNER authority for an HTTP caller.
 *
 * FORK-INTRODUCED SECURITY DIVERGENCE (#2735) — DO NOT "sync back" to upstream
 * here. Upstream OpenClaw returns `[...CLI_DEFAULT_OPERATOR_SCOPES]` for a
 * *trusted* (non-shared-secret) request that sends NO `x-*-scopes` header
 * ("trusted clients without an explicit header get the default operator scopes,
 * matching pre-#57783 behavior"). Those CLI defaults INCLUDE `operator.admin`,
 * so upstream INTENTIONALLY grants OWNER to a header-less caller on an
 * `auth:"none"` gateway — acceptable under upstream's local-trusted CLI model,
 * but NOT for RemoteClaw, which runs gateways network-exposed over messaging
 * channels where `auth:"none"` + no-header is the realistic attacker. The fork
 * therefore returns `[]` (→ NOT owner) on that branch. A future DIFF-SYNC MUST
 * NOT re-adopt the upstream `CLI_DEFAULT_OPERATOR_SCOPES` fallback on this branch
 * — doing so silently re-opens the #2735 IDOR. (Parallel to the #2733
 * re-introduction guard; ADR-0011.)
 */
export function resolveTrustedHttpOperatorScopes(
  req: IncomingMessage,
  authOrRequest?:
    | SharedSecretGatewayAuth
    | Pick<AuthorizedGatewayHttpRequest, "trustDeclaredOperatorScopes">,
): string[] {
  if (!shouldTrustDeclaredHttpOperatorScopes(req, authOrRequest)) {
    // Shared-secret bearer auth proves possession of the gateway secret, not a
    // narrower per-request operator identity. Don't let those callers self-assert
    // operator scopes via request headers.
    return [];
  }
  const declared = parseDeclaredHttpOperatorScopes(req);
  if (declared === undefined) {
    // #2735 divergence (see fn-level comment): no declared scopes ⇒ NOT owner.
    return [];
  }
  return declared;
}

/** True when the request's TRUSTED operator scopes include `operator.admin`. */
export function resolveHttpSenderIsOwner(
  req: IncomingMessage,
  authOrRequest?:
    | SharedSecretGatewayAuth
    | Pick<AuthorizedGatewayHttpRequest, "trustDeclaredOperatorScopes">,
): boolean {
  return resolveTrustedHttpOperatorScopes(req, authOrRequest).includes(ADMIN_SCOPE);
}

/**
 * Operator scopes for the OpenAI-compatible surface's METHOD-scope gate
 * (e.g. `chat.send`). This is method-authorization ONLY — it is NEVER used to
 * derive owner authority (that is `resolveOpenAiCompatibleHttpSenderIsOwner`).
 *
 * It stays permissive on a missing header so a plain OpenAI-SDK chat still works
 * under `auth:"none"` (the #2735 fix downscopes OWNER, it does NOT reject the
 * request — that would be the rejected "B2" behavior). Shared-secret bearer auth
 * is the documented trusted-operator surface for the compat API, so it restores
 * the CLI defaults. A caller may still voluntarily restrict itself by declaring
 * a narrower (or empty) `x-remoteclaw-scopes` header.
 */
export function resolveOpenAiCompatibleHttpOperatorScopes(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
): string[] {
  if (usesSharedSecretGatewayMethod(requestAuth.authMethod)) {
    return [...CLI_DEFAULT_OPERATOR_SCOPES];
  }
  const declared = parseDeclaredHttpOperatorScopes(req);
  return declared === undefined ? [...CLI_DEFAULT_OPERATOR_SCOPES] : declared;
}

/**
 * Owner authority for the OpenAI-compatible surface.
 *
 * Shared-secret bearer auth also carries owner semantics here: there is no
 * separate per-request owner primitive on that path, so owner-only tool policy
 * follows the documented trusted-operator contract. The short-circuit happens
 * BEFORE consulting declared scopes (so a shared-secret bearer is owner even
 * when it declares a narrower scope). For non-shared-secret callers (`none` /
 * `trusted-proxy`), owner requires an explicitly declared `operator.admin`
 * scope — a header-less or non-admin caller is NOT owner (#2735).
 */
export function resolveOpenAiCompatibleHttpSenderIsOwner(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
): boolean {
  if (usesSharedSecretGatewayMethod(requestAuth.authMethod)) {
    return true;
  }
  return resolveHttpSenderIsOwner(req, requestAuth);
}
