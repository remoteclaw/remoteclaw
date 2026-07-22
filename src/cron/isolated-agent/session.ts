import crypto from "node:crypto";
import type { RemoteClawConfig } from "../../config/config.js";
import {
  evaluateSessionFreshness,
  loadSessionStore,
  resolveSessionResetPolicy,
  resolveStorePath,
  type SessionEntry,
} from "../../config/sessions.js";

type FreshCronSessionSanitizeMode = "isolated-force-new" | "stale-rollover";

const FRESH_CRON_SAFE_PREFERENCE_FIELDS = [
  "chatType",
  "verboseLevel",
  "reasoningLevel",
  "ttsAuto",
  "responseUsage",
  "label",
  "displayName",
] as const satisfies readonly (keyof SessionEntry)[];

const STALE_SESSION_CONTEXT_PRESERVED_FIELDS = [
  "elevatedLevel",
  "groupActivation",
  "groupActivationNeedsSystemIntro",
  "sendPolicy",
  "queueMode",
  "queueDebounceMs",
  "queueCap",
  "queueDrop",
  "channel",
  "groupId",
  "subject",
  "groupChannel",
  "space",
  "origin",
  "acp",
] as const satisfies readonly (keyof SessionEntry)[];

function cloneSessionField<T>(value: T): T {
  return globalThis.structuredClone(value);
}

function copySessionFields(
  target: SessionEntry,
  entry: SessionEntry,
  fields: readonly (keyof SessionEntry)[],
): void {
  for (const field of fields) {
    if (entry[field] !== undefined) {
      target[field] = cloneSessionField(entry[field]) as never;
    }
  }
}

function preserveNonAutoModelOverride(target: SessionEntry, entry: SessionEntry): void {
  if (entry.modelOverrideSource !== "auto") {
    if (entry.modelOverride !== undefined) {
      target.modelOverride = entry.modelOverride;
    }
    if (entry.providerOverride !== undefined) {
      target.providerOverride = entry.providerOverride;
    }
    if (entry.modelOverrideSource !== undefined) {
      target.modelOverrideSource = entry.modelOverrideSource;
    }
  }
}

function preserveUserAuthOverride(target: SessionEntry, entry: SessionEntry): void {
  if (entry.authProfileOverrideSource === "user") {
    if (entry.authProfileOverride !== undefined) {
      target.authProfileOverride = entry.authProfileOverride;
    }
    target.authProfileOverrideSource = entry.authProfileOverrideSource;
    if (entry.authProfileOverrideCompactionCount !== undefined) {
      target.authProfileOverrideCompactionCount = entry.authProfileOverrideCompactionCount;
    }
  }
}

function sanitizeFreshCronSessionEntry(
  entry: SessionEntry,
  mode: FreshCronSessionSanitizeMode,
): SessionEntry {
  const next = {} as SessionEntry;

  copySessionFields(next, entry, FRESH_CRON_SAFE_PREFERENCE_FIELDS);
  if (mode === "stale-rollover") {
    copySessionFields(next, entry, STALE_SESSION_CONTEXT_PRESERVED_FIELDS);
  }
  preserveNonAutoModelOverride(next, entry);
  preserveUserAuthOverride(next, entry);

  return next;
}

/** Resolves or rolls over the cron session entry for one isolated-agent run. */
export function resolveCronSession(params: {
  cfg: RemoteClawConfig;
  sessionKey: string;
  nowMs: number;
  agentId: string;
  forceNew?: boolean;
  store?: Record<string, SessionEntry>;
}) {
  const sessionCfg = params.cfg.session;
  const storePath = resolveStorePath(sessionCfg?.store, {
    agentId: params.agentId,
  });
  const store = params.store ?? loadSessionStore(storePath);
  const entry = store[params.sessionKey];

  let sessionId: string;
  let isNewSession: boolean;
  let systemSent: boolean;

  if (!params.forceNew && entry?.sessionId) {
    // Cron/webhook sessions follow the direct reset policy so scheduled turns
    // roll over like 1:1 conversations rather than long-lived group contexts.
    const resetPolicy = resolveSessionResetPolicy({
      sessionCfg,
      resetType: "direct",
    });
    const freshness = evaluateSessionFreshness({
      updatedAt: entry.updatedAt,
      now: params.nowMs,
      policy: resetPolicy,
    });

    if (freshness.fresh) {
      sessionId = entry.sessionId;
      isNewSession = false;
      systemSent = entry.systemSent ?? false;
    } else {
      sessionId = crypto.randomUUID();
      isNewSession = true;
      systemSent = false;
    }
  } else {
    sessionId = crypto.randomUUID();
    isNewSession = true;
    systemSent = false;
  }

  const baseEntry = entry
    ? isNewSession
      ? sanitizeFreshCronSessionEntry(
          entry,
          params.forceNew ? "isolated-force-new" : "stale-rollover",
        )
      : entry
    : undefined;

  const sessionEntry: SessionEntry = {
    // Fresh cron sessions keep user preference/auth overrides but drop resume
    // handles and auto-fallback model overrides that belong to the old run.
    ...baseEntry,
    sessionId,
    updatedAt: params.nowMs,
    systemSent,
  };
  return { storePath, store, sessionEntry, systemSent, isNewSession };
}
