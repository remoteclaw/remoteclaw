import { randomUUID } from "node:crypto";
import { parseModelRef } from "../agents/provider-utils.js";
import { normalizeGroupActivation } from "../auto-reply/group-activation.js";
import { normalizeUsageDisplay } from "../auto-reply/thinking.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { isAcpSessionKey, isSubagentSessionKey } from "../routing/session-key.js";
import { applyVerboseOverride, parseVerboseOverride } from "../sessions/level-overrides.js";
import { normalizeSendPolicy } from "../sessions/send-policy.js";
import { parseSessionLabel } from "../sessions/session-label.js";
import { ErrorCodes, type ErrorShape, errorShape, type SessionsPatchParams } from "./protocol/index.js";

function invalid(message: string): { ok: false; error: ErrorShape } {
  return { ok: false, error: errorShape(ErrorCodes.INVALID_REQUEST, message) };
}

function supportsSpawnLineage(storeKey: string): boolean {
  return isSubagentSessionKey(storeKey) || isAcpSessionKey(storeKey);
}

function normalizeSubagentRole(raw: string): "orchestrator" | "leaf" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "orchestrator" || normalized === "leaf") {
    return normalized;
  }
  return undefined;
}

function normalizeSubagentControlScope(raw: string): "children" | "none" | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "children" || normalized === "none") {
    return normalized;
  }
  return undefined;
}

export async function applySessionsPatchToStore(params: {
  cfg: RemoteClawConfig;
  store: Record<string, SessionEntry>;
  storeKey: string;
  patch: SessionsPatchParams;
}): Promise<{ ok: true; entry: SessionEntry } | { ok: false; error: ErrorShape }> {
  const { cfg: _cfg, store, storeKey, patch } = params;
  const now = Date.now();
  const resolvedDefault = { provider: "unknown", model: "unknown" };

  const existing = store[storeKey];
  const next: SessionEntry = existing
    ? {
        ...existing,
        updatedAt: Math.max(existing.updatedAt ?? 0, now),
      }
    : { sessionId: randomUUID(), updatedAt: now };

  if ("spawnedBy" in patch) {
    const raw = patch.spawnedBy;
    if (raw === null) {
      if (existing?.spawnedBy) {
        return invalid("spawnedBy cannot be cleared once set");
      }
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid spawnedBy: empty");
      }
      if (!supportsSpawnLineage(storeKey)) {
        return invalid("spawnedBy is only supported for subagent:* or acp:* sessions");
      }
      if (existing?.spawnedBy && existing.spawnedBy !== trimmed) {
        return invalid("spawnedBy cannot be changed once set");
      }
      next.spawnedBy = trimmed;
    }
  }

  if ("spawnDepth" in patch) {
    const raw = patch.spawnDepth;
    if (raw === null) {
      if (typeof existing?.spawnDepth === "number") {
        return invalid("spawnDepth cannot be cleared once set");
      }
    } else if (raw !== undefined) {
      if (!supportsSpawnLineage(storeKey)) {
        return invalid("spawnDepth is only supported for subagent:* or acp:* sessions");
      }
      const numeric = Number(raw);
      if (!Number.isInteger(numeric) || numeric < 0) {
        return invalid("invalid spawnDepth (use an integer >= 0)");
      }
      const normalized = numeric;
      if (typeof existing?.spawnDepth === "number" && existing.spawnDepth !== normalized) {
        return invalid("spawnDepth cannot be changed once set");
      }
      next.spawnDepth = normalized;
    }
  }

  if ("subagentRole" in patch) {
    const raw = patch.subagentRole;
    if (raw === null) {
      if (existing?.subagentRole) {
        return invalid("subagentRole cannot be cleared once set");
      }
    } else if (raw !== undefined) {
      if (!supportsSpawnLineage(storeKey)) {
        return invalid("subagentRole is only supported for subagent:* or acp:* sessions");
      }
      const normalized = normalizeSubagentRole(String(raw));
      if (!normalized) {
        return invalid('invalid subagentRole (use "orchestrator" or "leaf")');
      }
      if (existing?.subagentRole && existing.subagentRole !== normalized) {
        return invalid("subagentRole cannot be changed once set");
      }
      next.subagentRole = normalized;
    }
  }

  if ("subagentControlScope" in patch) {
    const raw = patch.subagentControlScope;
    if (raw === null) {
      if (existing?.subagentControlScope) {
        return invalid("subagentControlScope cannot be cleared once set");
      }
    } else if (raw !== undefined) {
      if (!supportsSpawnLineage(storeKey)) {
        return invalid("subagentControlScope is only supported for subagent:* or acp:* sessions");
      }
      const normalized = normalizeSubagentControlScope(String(raw));
      if (!normalized) {
        return invalid('invalid subagentControlScope (use "children" or "none")');
      }
      if (existing?.subagentControlScope && existing.subagentControlScope !== normalized) {
        return invalid("subagentControlScope cannot be changed once set");
      }
      next.subagentControlScope = normalized;
    }
  }

  if ("label" in patch) {
    const raw = patch.label;
    if (raw === null) {
      delete next.label;
    } else if (raw !== undefined) {
      const parsed = parseSessionLabel(raw);
      if (!parsed.ok) {
        return invalid(parsed.error);
      }
      for (const [key, entry] of Object.entries(store)) {
        if (key === storeKey) {
          continue;
        }
        if (entry?.label === parsed.label) {
          return invalid(`label already in use: ${parsed.label}`);
        }
      }
      next.label = parsed.label;
    }
  }

  if ("verboseLevel" in patch) {
    const raw = patch.verboseLevel;
    const parsed = parseVerboseOverride(raw);
    if (!parsed.ok) {
      return invalid(parsed.error);
    }
    applyVerboseOverride(next, parsed.value);
  }

  if ("responseUsage" in patch) {
    const raw = patch.responseUsage;
    if (raw === null) {
      delete next.responseUsage;
    } else if (raw !== undefined) {
      const normalized = normalizeUsageDisplay(String(raw));
      if (!normalized) {
        return invalid('invalid responseUsage (use "off"|"tokens"|"full")');
      }
      if (normalized === "off") {
        delete next.responseUsage;
      } else {
        next.responseUsage = normalized;
      }
    }
  }

  if ("model" in patch) {
    const raw = patch.model;
    if (raw === null) {
      // Reset to default — clear overrides.
      delete next.providerOverride;
      delete next.modelOverride;
    } else if (raw !== undefined) {
      const trimmed = String(raw).trim();
      if (!trimmed) {
        return invalid("invalid model: empty");
      }
      const parsed = parseModelRef(trimmed, resolvedDefault.provider);
      if (!parsed) {
        return invalid(`invalid model: "${trimmed}"`);
      }
      const isDefault = parsed.provider === resolvedDefault.provider && parsed.model === resolvedDefault.model;
      if (isDefault) {
        delete next.providerOverride;
        delete next.modelOverride;
      } else {
        next.providerOverride = parsed.provider;
        next.modelOverride = parsed.model;
      }
    }
  }

  if ("sendPolicy" in patch) {
    const raw = patch.sendPolicy;
    if (raw === null) {
      delete next.sendPolicy;
    } else if (raw !== undefined) {
      const normalized = normalizeSendPolicy(String(raw));
      if (!normalized) {
        return invalid('invalid sendPolicy (use "allow"|"deny")');
      }
      next.sendPolicy = normalized;
    }
  }

  if ("groupActivation" in patch) {
    const raw = patch.groupActivation;
    if (raw === null) {
      delete next.groupActivation;
    } else if (raw !== undefined) {
      const normalized = normalizeGroupActivation(String(raw));
      if (!normalized) {
        return invalid('invalid groupActivation (use "mention"|"always")');
      }
      next.groupActivation = normalized;
    }
  }

  store[storeKey] = next;
  return { ok: true, entry: next };
}
