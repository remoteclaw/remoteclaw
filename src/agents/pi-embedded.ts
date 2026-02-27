// Stub: pi-embedded execution engine was gutted (#74).
// This barrel provides stub implementations so existing callers compile
// without import-path changes.

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type EmbeddedPiAgentMeta = {
  model?: string;
  usage?: { input?: number; output?: number; total?: number };
  lastCallUsage?: { input?: number; output?: number; total?: number };
  promptTokens?: number;
};

export type EmbeddedPiRunMeta = {
  agentMeta?: EmbeddedPiAgentMeta;
};

export type EmbeddedPiRunResult = {
  payloads?: Array<{ text?: string; mediaUrl?: string; mediaUrls?: string[] }>;
  meta?: EmbeddedPiRunMeta;
  messagingToolSentTexts?: string[];
  messagingToolSentMediaUrls?: string[];
  messagingToolSentTargets?: Array<{ to?: string; channel?: string }>;
};

export type EmbeddedPiCompactResult = {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    tokensBefore?: number;
    tokensAfter?: number;
  };
};

/* ------------------------------------------------------------------ */
/*  Stub functions                                                     */
/* ------------------------------------------------------------------ */

/** Always returns `false` — no embedded run is ever active. */
export function isEmbeddedPiRunActive(_sessionId: string): boolean {
  return false;
}

/** Always returns `false` — no embedded run is ever streaming. */
export function isEmbeddedPiRunStreaming(_sessionId: string): boolean {
  return false;
}

/** No-op — nothing to abort. Returns `false` (nothing was aborted). */
export function abortEmbeddedPiRun(_sessionId: string): boolean {
  return false;
}

/** Resolves immediately with `true` — no run to wait for. */
export async function waitForEmbeddedPiRunEnd(
  _sessionId: string,
  _timeoutMs?: number,
): Promise<boolean> {
  return true;
}

/** No-op — nothing to queue. Returns `false` (nothing was queued). */
export function queueEmbeddedPiMessage(_sessionId: string, _message: string): boolean {
  return false;
}

/** Returns `"default"` — lane resolution is trivial without the engine. */
export function resolveEmbeddedSessionLane(_sessionKey?: string): string {
  return "default";
}

/** Returns `0` — no embedded runs are ever active. */
export function getActiveEmbeddedRunCount(): number {
  return 0;
}

/**
 * Stub — the embedded Pi execution engine has been removed.
 * Returns an empty result so callers that still reference this
 * function will compile and degrade gracefully.
 */
export async function runEmbeddedPiAgent(
  _params: Record<string, unknown>,
): Promise<EmbeddedPiRunResult> {
  return { payloads: [] };
}

/**
 * Stub — compaction is unavailable without the embedded engine.
 */
export async function compactEmbeddedPiSession(
  _params: Record<string, unknown>,
): Promise<EmbeddedPiCompactResult> {
  return {
    ok: false,
    compacted: false,
    reason: "Embedded engine removed (#74); compaction unavailable.",
  };
}
