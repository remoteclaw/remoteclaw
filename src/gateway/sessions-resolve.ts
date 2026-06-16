import type { RemoteClawConfig } from "../config/config.js";
import { loadSessionStore, updateSessionStore } from "../config/sessions.js";
import { parseSessionLabel } from "../sessions/session-label.js";
import {
  ErrorCodes,
  type ErrorShape,
  errorShape,
  type SessionsResolveParams,
} from "./protocol/index.js";
import {
  listSessionsFromStore,
  loadCombinedSessionStoreForGateway,
  pruneLegacyStoreKeys,
  resolveDeletedAgentIdFromSessionKey,
  resolveGatewaySessionStoreTarget,
} from "./session-utils.js";

export type SessionsResolveResult = { ok: true; key: string } | { ok: false; error: ErrorShape };

/**
 * Reject a resolved session key whose owning agent was deleted from
 * configuration, mirroring the send-path guard in
 * `server-methods/chat.ts` (#65524). Returns a rejection result when the
 * key encodes a deleted agent, or null when the key is safe to return.
 *
 * NOTE: legacy `main`-alias entries surfaced via sessionId/label that should
 * be remapped onto the live default agent are NOT yet handled here; that
 * remap is deferred to a separate hardening change so the reject parity can
 * land without inventing new authorization behavior. See the skipped
 * "resolves legacy main-alias matches" case in sessions-resolve-store.test.ts.
 */
function rejectDeletedAgentSessionKey(
  cfg: RemoteClawConfig,
  key: string,
): SessionsResolveResult | null {
  const deletedAgentId = resolveDeletedAgentIdFromSessionKey(cfg, key);
  if (deletedAgentId === null) {
    return null;
  }
  return {
    ok: false,
    error: errorShape(
      ErrorCodes.INVALID_REQUEST,
      `Agent "${deletedAgentId}" no longer exists in configuration`,
    ),
  };
}

export async function resolveSessionKeyFromResolveParams(params: {
  cfg: RemoteClawConfig;
  p: SessionsResolveParams;
}): Promise<SessionsResolveResult> {
  const { cfg, p } = params;

  const key = typeof p.key === "string" ? p.key.trim() : "";
  const hasKey = key.length > 0;
  const sessionId = typeof p.sessionId === "string" ? p.sessionId.trim() : "";
  const hasSessionId = sessionId.length > 0;
  const hasLabel = typeof p.label === "string" && p.label.trim().length > 0;
  const selectionCount = [hasKey, hasSessionId, hasLabel].filter(Boolean).length;
  if (selectionCount > 1) {
    return {
      ok: false,
      error: errorShape(
        ErrorCodes.INVALID_REQUEST,
        "Provide either key, sessionId, or label (not multiple)",
      ),
    };
  }
  if (selectionCount === 0) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, "Either key, sessionId, or label is required"),
    };
  }

  if (hasKey) {
    const target = resolveGatewaySessionStoreTarget({ cfg, key });
    const store = loadSessionStore(target.storePath);
    if (store[target.canonicalKey]) {
      if (typeof p.spawnedBy === "string" && p.spawnedBy.trim().length > 0) {
        const visible = listSessionsFromStore({
          cfg,
          storePath: target.storePath,
          store,
          opts: {
            includeGlobal: p.includeGlobal === true,
            includeUnknown: p.includeUnknown === true,
            spawnedBy: p.spawnedBy,
            agentId: p.agentId,
          },
        }).sessions.some((session) => session.key === target.canonicalKey);
        if (!visible) {
          return {
            ok: false,
            error: errorShape(ErrorCodes.INVALID_REQUEST, `No session found: ${key}`),
          };
        }
      }
      const deletedRejection = rejectDeletedAgentSessionKey(cfg, target.canonicalKey);
      if (deletedRejection) {
        return deletedRejection;
      }
      return { ok: true, key: target.canonicalKey };
    }
    const legacyKey = target.storeKeys.find((candidate) => store[candidate]);
    if (!legacyKey) {
      return {
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `No session found: ${key}`),
      };
    }
    await updateSessionStore(target.storePath, (s) => {
      const liveTarget = resolveGatewaySessionStoreTarget({ cfg, key, store: s });
      const canonicalKey = liveTarget.canonicalKey;
      // Migrate the first legacy entry to the canonical key.
      if (!s[canonicalKey] && s[legacyKey]) {
        s[canonicalKey] = s[legacyKey];
      }
      pruneLegacyStoreKeys({ store: s, canonicalKey, candidates: liveTarget.storeKeys });
    });
    if (typeof p.spawnedBy === "string" && p.spawnedBy.trim().length > 0) {
      const visible = listSessionsFromStore({
        cfg,
        storePath: target.storePath,
        store: loadSessionStore(target.storePath),
        opts: {
          includeGlobal: p.includeGlobal === true,
          includeUnknown: p.includeUnknown === true,
          spawnedBy: p.spawnedBy,
          agentId: p.agentId,
        },
      }).sessions.some((session) => session.key === target.canonicalKey);
      if (!visible) {
        return {
          ok: false,
          error: errorShape(ErrorCodes.INVALID_REQUEST, `No session found: ${key}`),
        };
      }
    }
    const deletedRejection = rejectDeletedAgentSessionKey(cfg, target.canonicalKey);
    if (deletedRejection) {
      return deletedRejection;
    }
    return { ok: true, key: target.canonicalKey };
  }

  if (hasSessionId) {
    const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
    const list = listSessionsFromStore({
      cfg,
      storePath,
      store,
      opts: {
        includeGlobal: p.includeGlobal === true,
        includeUnknown: p.includeUnknown === true,
        spawnedBy: p.spawnedBy,
        agentId: p.agentId,
      },
    });
    const matches = list.sessions.filter(
      (session) => session.sessionId === sessionId || session.key === sessionId,
    );
    if (matches.length === 0) {
      return {
        ok: false,
        error: errorShape(ErrorCodes.INVALID_REQUEST, `No session found: ${sessionId}`),
      };
    }
    if (matches.length > 1) {
      const keys = matches.map((session) => session.key).join(", ");
      return {
        ok: false,
        error: errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Multiple sessions found for sessionId: ${sessionId} (${keys})`,
        ),
      };
    }
    const matchKey = String(matches[0]?.key ?? "");
    const deletedRejection = rejectDeletedAgentSessionKey(cfg, matchKey);
    if (deletedRejection) {
      return deletedRejection;
    }
    return { ok: true, key: matchKey };
  }

  const parsedLabel = parseSessionLabel(p.label);
  if (!parsedLabel.ok) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, parsedLabel.error),
    };
  }

  const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
  const list = listSessionsFromStore({
    cfg,
    storePath,
    store,
    opts: {
      includeGlobal: p.includeGlobal === true,
      includeUnknown: p.includeUnknown === true,
      label: parsedLabel.label,
      agentId: p.agentId,
      spawnedBy: p.spawnedBy,
      limit: 2,
    },
  });
  if (list.sessions.length === 0) {
    return {
      ok: false,
      error: errorShape(
        ErrorCodes.INVALID_REQUEST,
        `No session found with label: ${parsedLabel.label}`,
      ),
    };
  }
  if (list.sessions.length > 1) {
    const keys = list.sessions.map((s) => s.key).join(", ");
    return {
      ok: false,
      error: errorShape(
        ErrorCodes.INVALID_REQUEST,
        `Multiple sessions found with label: ${parsedLabel.label} (${keys})`,
      ),
    };
  }

  const labelKey = String(list.sessions[0]?.key ?? "");
  const deletedRejection = rejectDeletedAgentSessionKey(cfg, labelKey);
  if (deletedRejection) {
    return deletedRejection;
  }
  return { ok: true, key: labelKey };
}
