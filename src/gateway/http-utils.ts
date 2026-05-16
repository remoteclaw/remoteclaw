import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { buildAgentMainSessionKey, normalizeAgentId } from "../routing/session-key.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../shared/string-coerce.js";
import { normalizeMessageChannel } from "../utils/message-channel.js";

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

export function resolveAgentIdFromModel(model: string | undefined): string | undefined {
  const raw = model?.trim();
  if (!raw) {
    return undefined;
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
}): string {
  const fromHeader = resolveAgentIdFromHeader(params.req);
  if (fromHeader) {
    return fromHeader;
  }

  const fromModel = resolveAgentIdFromModel(params.model);
  return fromModel ?? "main";
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
  const agentId = resolveAgentIdForRequest({ req: params.req, model: params.model });
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
