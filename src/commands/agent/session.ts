import crypto from "node:crypto";
import { listAgentIds } from "../../agents/agent-scope.js";
import type { MsgContext } from "../../auto-reply/templating.js";
import { normalizeVerboseLevel, type VerboseLevel } from "../../auto-reply/thinking.js";
import type { RemoteClawConfig } from "../../config/config.js";
import {
  evaluateSessionFreshness,
  loadSessionStore,
  resolveAgentIdFromSessionKey,
  resolveChannelResetConfig,
  resolveExplicitAgentSessionKey,
  resolveSessionResetPolicy,
  resolveSessionResetType,
  resolveSessionKey,
  resolveStorePath,
  type SessionEntry,
} from "../../config/sessions.js";
import { normalizeMainKey } from "../../routing/session-key.js";

export type SessionResolution = {
  sessionId: string;
  sessionKey?: string;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  storePath: string;
  isNewSession: boolean;
  persistedVerbose?: VerboseLevel;
};

type SessionKeyResolution = {
  sessionKey?: string;
  sessionStore: Record<string, SessionEntry>;
  storePath: string;
};

export function resolveSessionKeyForRequest(opts: {
  cfg: RemoteClawConfig;
  to?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
}): SessionKeyResolution {
  const sessionCfg = opts.cfg.session;
  const scope = sessionCfg?.scope ?? "per-sender";
  const mainKey = normalizeMainKey(sessionCfg?.mainKey);
  const explicitSessionKey =
    opts.sessionKey?.trim() ||
    resolveExplicitAgentSessionKey({
      cfg: opts.cfg,
      agentId: opts.agentId,
    });
  const storeAgentId = resolveAgentIdFromSessionKey(explicitSessionKey);
  const storePath = resolveStorePath(sessionCfg?.store, {
    agentId: storeAgentId,
  });
  const sessionStore = loadSessionStore(storePath);

  const ctx: MsgContext | undefined = opts.to?.trim() ? { From: opts.to } : undefined;
  let sessionKey: string | undefined =
    explicitSessionKey ?? (ctx ? resolveSessionKey(scope, ctx, mainKey) : undefined);

  // If a session id was provided, prefer to re-use its entry (by id) even when no key was derived.
  if (
    !explicitSessionKey &&
    opts.sessionId &&
    (!sessionKey || sessionStore[sessionKey]?.sessionId !== opts.sessionId)
  ) {
    const foundKey = Object.keys(sessionStore).find(
      (key) => sessionStore[key]?.sessionId === opts.sessionId,
    );
    if (foundKey) {
      sessionKey = foundKey;
    }
  }

  // When sessionId was provided but not found in the primary store, search all agent stores.
  // Sessions created under a specific agent live in that agent's store file; the primary
  // store (derived from the default agent) won't contain them.
  // Also covers the case where --to derived a sessionKey that doesn't match the requested sessionId.
  if (
    opts.sessionId &&
    !explicitSessionKey &&
    (!sessionKey || sessionStore[sessionKey]?.sessionId !== opts.sessionId)
  ) {
    const allAgentIds = listAgentIds(opts.cfg);
    for (const agentId of allAgentIds) {
      if (agentId === storeAgentId) {
        continue;
      }
      const altStorePath = resolveStorePath(sessionCfg?.store, { agentId });
      const altStore = loadSessionStore(altStorePath);
      const foundKey = Object.keys(altStore).find(
        (key) => altStore[key]?.sessionId === opts.sessionId,
      );
      if (foundKey) {
        return { sessionKey: foundKey, sessionStore: altStore, storePath: altStorePath };
      }
    }
  }

  return { sessionKey, sessionStore, storePath };
}

export function resolveSession(opts: {
  cfg: RemoteClawConfig;
  to?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
}): SessionResolution {
  const sessionCfg = opts.cfg.session;
  const { sessionKey, sessionStore, storePath } = resolveSessionKeyForRequest({
    cfg: opts.cfg,
    to: opts.to,
    sessionId: opts.sessionId,
    sessionKey: opts.sessionKey,
    agentId: opts.agentId,
  });
  const now = Date.now();

  const sessionEntry = sessionKey ? sessionStore[sessionKey] : undefined;

  const resetType = resolveSessionResetType({ sessionKey });
  const channelReset = resolveChannelResetConfig({
    sessionCfg,
    channel: sessionEntry?.lastChannel ?? sessionEntry?.channel,
  });
  const resetPolicy = resolveSessionResetPolicy({
    sessionCfg,
    resetType,
    resetOverride: channelReset,
  });
  const fresh = sessionEntry
    ? evaluateSessionFreshness({ updatedAt: sessionEntry.updatedAt, now, policy: resetPolicy })
        .fresh
    : false;
  const explicitSessionId = opts.sessionId?.trim();
  // #2120: only reuse the stored entry when the session is genuinely being
  // continued — either it's still fresh, or the caller passed an explicit
  // sessionId matching the stored one. A stale entry (or a mismatched explicit
  // id) is a rollover: start a new session and do NOT surface the old entry,
  // whose expired cliSessionIds would otherwise be resumed via `--resume`
  // (same class as #2112 in the cron path).
  const reuseExistingSession = explicitSessionId
    ? sessionEntry?.sessionId === explicitSessionId
    : fresh;
  const sessionId =
    explicitSessionId ||
    (reuseExistingSession ? sessionEntry?.sessionId : undefined) ||
    crypto.randomUUID();
  const isNewSession = !reuseExistingSession;
  const persistedSessionEntry = reuseExistingSession ? sessionEntry : undefined;

  // Drop the stale store entry on rollover so its expired session can't be resumed later.
  if (isNewSession && sessionKey && sessionStore[sessionKey]) {
    delete sessionStore[sessionKey];
  }

  const persistedVerbose =
    reuseExistingSession && sessionEntry?.verboseLevel
      ? normalizeVerboseLevel(sessionEntry.verboseLevel)
      : undefined;

  return {
    sessionId,
    sessionKey,
    sessionEntry: persistedSessionEntry,
    sessionStore,
    storePath,
    isNewSession,
    persistedVerbose,
  };
}
