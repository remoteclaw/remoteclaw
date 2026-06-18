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
  isSingleConfiguredSessionStore,
  listSessionsFromStore,
  loadCombinedSessionStoreForGateway,
  pruneLegacyStoreKeys,
  resolveDeletedAgentIdFromSessionKey,
  resolveGatewaySessionStoreTarget,
  resolveLegacyDefaultMainRemap,
} from "./session-utils.js";

export type SessionsResolveResult = { ok: true; key: string } | { ok: false; error: ErrorShape };

/**
 * Three-state resolution for a session key whose encoded agent is no longer in
 * configuration:
 *   - `pass`   — the key's agent is still live; return the key unchanged.
 *   - `reject` — the agent was deleted; ship the deleted-agent error (mirrors
 *                the send-path guard in `server-methods/chat.ts`, #65524).
 *   - `remap`  — the key is the legacy default-agent main-session alias
 *                `agent:main:main` and the narrow 4-conjunct gate holds, so it
 *                resolves onto the live default agent's main session instead.
 *
 * ADR-NOTE — legacy `agent:main:main` remap boundary (#2720 / #2733)
 * -----------------------------------------------------------------
 * WHY: a legacy single-store deployment serialized the default agent's main
 * session under `agent:main:main`. After the default agent was renamed (e.g. to
 * `ops`) — or the no-config default became `default` — that on-disk entry
 * encodes a now-deleted agent and was rejected with `Agent "main" no longer
 * exists`, breaking continuity for the user's old default-agent main thread.
 * This remaps it onto the live default agent's main session. The boundary is
 * deliberately NARROW: it fires iff ALL FOUR conjuncts hold (see
 * `resolveLegacyDefaultMainRemap` for the per-conjunct guard):
 *   1. encoded agent-id is the literal historical default id `main`, AND the
 *      key is the main-SESSION alias `agent:main:main` (not a concrete
 *      `agent:main:<peer>` session, which stays rejected);
 *   2. `main` is NOT a currently-configured agent;
 *   3. a live DEFAULT agent exists (a CONFIGURED agent, not the no-config
 *      `default` fallback);
 *   4. LEGACY SINGLE-STORE PROVENANCE — the matched entry came from the single
 *      configured (non-template) store, NOT a discovered per-agent store.
 *      Conjunct 4 is LOAD-BEARING FOR SECURITY: it keeps a discovered per-agent
 *      deleted-agent store REJECTED, preserving the #65524 deleted-agent
 *      send/steer guard. A remap that ignored provenance would re-open that
 *      hole (regressing the discovered-store and explicit-key reject tests in
 *      sessions-resolve-store.test.ts).
 *
 * FORK PROVENANCE (do NOT delete on upstream diff-sync): this deleted-agent
 * reject guard AND its main-alias remap are FORK-INTRODUCED. Upstream
 * OpenClaw's `sessions-resolve.ts` has NEITHER the guard NOR the skipped/now-
 * unskipped test — it returns matched keys without a deleted-agent check. A
 * future diff-sync that "restores" upstream's no-guard shape would silently
 * delete this hardening and re-open #65524. Treat this block as a
 * re-introduction-guarded divergence (ADR-0011 pattern): keep it across syncs.
 */
type DeletedAgentKeyResolution =
  | { kind: "pass" }
  | { kind: "remap"; key: string }
  | { kind: "reject"; result: SessionsResolveResult };

function resolveDeletedAgentSessionKey(
  cfg: RemoteClawConfig,
  key: string,
  fromSingleStore: boolean,
): DeletedAgentKeyResolution {
  const deletedAgentId = resolveDeletedAgentIdFromSessionKey(cfg, key);
  if (deletedAgentId === null) {
    return { kind: "pass" };
  }
  const remappedKey = resolveLegacyDefaultMainRemap(cfg, key, fromSingleStore);
  if (remappedKey !== null) {
    return { kind: "remap", key: remappedKey };
  }
  return {
    kind: "reject",
    result: {
      ok: false,
      error: errorShape(
        ErrorCodes.INVALID_REQUEST,
        `Agent "${deletedAgentId}" no longer exists in configuration`,
      ),
    },
  };
}

/**
 * Apply a {@link DeletedAgentKeyResolution} to a freshly matched key: reject
 * surfaces the error, remap swaps in the live-default key, pass returns the
 * original. Shared by all four resolution paths (key / sessionId / label).
 */
function applyDeletedAgentResolution(
  cfg: RemoteClawConfig,
  matchKey: string,
  fromSingleStore: boolean,
): SessionsResolveResult {
  const resolution = resolveDeletedAgentSessionKey(cfg, matchKey, fromSingleStore);
  if (resolution.kind === "reject") {
    return resolution.result;
  }
  return { ok: true, key: resolution.kind === "remap" ? resolution.key : matchKey };
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
      return applyDeletedAgentResolution(
        cfg,
        target.canonicalKey,
        isSingleConfiguredSessionStore(cfg),
      );
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
    return applyDeletedAgentResolution(
      cfg,
      target.canonicalKey,
      isSingleConfiguredSessionStore(cfg),
    );
  }

  if (hasSessionId) {
    const { storePath, store, fromSingleStore } = loadCombinedSessionStoreForGateway(cfg);
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
    return applyDeletedAgentResolution(cfg, matchKey, fromSingleStore);
  }

  const parsedLabel = parseSessionLabel(p.label);
  if (!parsedLabel.ok) {
    return {
      ok: false,
      error: errorShape(ErrorCodes.INVALID_REQUEST, parsedLabel.error),
    };
  }

  const { storePath, store, fromSingleStore } = loadCombinedSessionStoreForGateway(cfg);
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
  return applyDeletedAgentResolution(cfg, labelKey, fromSingleStore);
}
