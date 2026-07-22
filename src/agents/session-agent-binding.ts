import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "@remoteclaw/normalization-core/string-coerce";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import {
  parseAgentSessionKey,
  normalizeAgentId,
  normalizeMainKey,
} from "../routing/session-key.js";
import { resolveDefaultAgentId } from "./agent-scope.js";

export const MODULE_ATTESTATIONS = {
  resolveBoundAgentIdForSession: "live",
} as const;

/**
 * Resolve the trusted active agent bound to a host-owned session reference.
 */
export function resolveBoundAgentIdForSession(params: {
  config?: RemoteClawConfig;
  sessionKey?: string;
  agentId?: string;
}): string | undefined {
  const explicitAgentId = normalizeOptionalString(params.agentId);
  if (explicitAgentId) {
    return normalizeAgentId(explicitAgentId);
  }

  const normalizedSessionKey = normalizeOptionalString(params.sessionKey);
  if (!normalizedSessionKey) {
    return undefined;
  }

  const parsed = parseAgentSessionKey(normalizedSessionKey);
  if (parsed?.agentId) {
    return normalizeAgentId(parsed.agentId);
  }

  const loweredSessionKey = normalizeLowercaseStringOrEmpty(normalizedSessionKey);
  const mainKey = normalizeMainKey(params.config?.session?.mainKey);
  if (loweredSessionKey === "main" || loweredSessionKey === mainKey) {
    return resolveDefaultAgentId(params.config ?? {});
  }
  return undefined;
}
