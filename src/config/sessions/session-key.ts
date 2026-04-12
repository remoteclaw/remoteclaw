import type { MsgContext } from "../../auto-reply/templating.js";
import {
  buildAgentMainSessionKey,
  normalizeAgentId,
  normalizeMainKey,
} from "../../routing/session-key.js";
import { normalizeE164 } from "../../utils.js";
import { normalizeExplicitSessionKey } from "./explicit-session-key-normalization.js";
import { resolveGroupSessionKey } from "./group.js";
import type { SessionScope } from "./types.js";

// Decide which session bucket to use (per-sender vs global).
export function deriveSessionKey(scope: SessionScope, ctx: MsgContext) {
  if (scope === "global") {
    return "global";
  }
  const resolvedGroup = resolveGroupSessionKey(ctx);
  if (resolvedGroup) {
    return resolvedGroup.key;
  }
  const from = ctx.From ? normalizeE164(ctx.From) : "";
  return from || "unknown";
}

/**
 * Resolve the session key with a canonical direct-chat bucket for the given agent.
 * All non-group direct chats collapse to this bucket; groups stay isolated.
 */
export function resolveSessionKey(
  scope: SessionScope,
  ctx: MsgContext,
  agentId: string,
  mainKey?: string,
) {
  const explicit = ctx.SessionKey?.trim();
  if (explicit) {
    return normalizeExplicitSessionKey(explicit, ctx);
  }
  const raw = deriveSessionKey(scope, ctx);
  if (scope === "global") {
    return raw;
  }
  const normalizedAgentId = normalizeAgentId(agentId);
  const canonicalMainKey = normalizeMainKey(mainKey);
  const canonical = buildAgentMainSessionKey({
    agentId: normalizedAgentId,
    mainKey: canonicalMainKey,
  });
  const isGroup = raw.includes(":group:") || raw.includes(":channel:");
  if (!isGroup) {
    return canonical;
  }
  return `agent:${normalizedAgentId}:${raw}`;
}
