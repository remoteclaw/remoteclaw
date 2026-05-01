import {
  buildAgentMainSessionKey,
  normalizeAgentId,
  normalizeMainKey,
  resolveAgentIdFromSessionKey,
} from "../../routing/session-key.js";
import { loadConfig } from "../config.js";
import type { SessionScope } from "./types.js";

export function resolveMainSessionKey(cfg?: {
  session?: { scope?: SessionScope; mainKey?: string };
  agents?: { list?: Array<{ id?: string }> };
}): string {
  if (cfg?.session?.scope === "global") {
    return "global";
  }
  const firstAgentId = cfg?.agents?.list?.[0]?.id;
  if (!firstAgentId) {
    throw new Error("Cannot resolve main session key: no agents configured (agents.list is empty)");
  }
  const agentId = normalizeAgentId(firstAgentId);
  const mainKey = normalizeMainKey(cfg?.session?.mainKey);
  return buildAgentMainSessionKey({ agentId, mainKey });
}

export function resolveMainSessionKeyFromConfig(): string {
  return resolveMainSessionKey(loadConfig());
}

export { resolveAgentIdFromSessionKey };

export function resolveAgentMainSessionKey(params: {
  cfg?: { session?: { mainKey?: string } };
  agentId: string;
}): string {
  const mainKey = normalizeMainKey(params.cfg?.session?.mainKey);
  return buildAgentMainSessionKey({ agentId: params.agentId, mainKey });
}

export function resolveExplicitAgentSessionKey(params: {
  cfg?: { session?: { scope?: SessionScope; mainKey?: string } };
  agentId?: string | null;
}): string | undefined {
  const agentId = params.agentId?.trim();
  if (!agentId) {
    return undefined;
  }
  return resolveAgentMainSessionKey({ cfg: params.cfg, agentId });
}

export function canonicalizeMainSessionAlias(params: {
  cfg?: { session?: { scope?: SessionScope; mainKey?: string } };
  agentId: string;
  sessionKey: string;
}): string {
  const raw = params.sessionKey.trim();
  if (!raw) {
    return raw;
  }

  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.cfg?.session?.mainKey);
  const agentMainSessionKey = buildAgentMainSessionKey({ agentId, mainKey });
  const agentMainAliasKey = buildAgentMainSessionKey({
    agentId,
    mainKey: "main",
  });

  const isMainAlias =
    raw === "main" || raw === mainKey || raw === agentMainSessionKey || raw === agentMainAliasKey;

  if (params.cfg?.session?.scope === "global" && isMainAlias) {
    return "global";
  }
  if (isMainAlias) {
    return agentMainSessionKey;
  }
  return raw;
}
