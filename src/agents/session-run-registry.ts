/**
 * In-process registry tracking which sessions currently have an active
 * CLI agent subprocess (ChannelBridge turn).
 *
 * Replaces the conceptual role of the Pi engine's ACTIVE_EMBEDDED_RUNS Map
 * that was stubbed to false/0 during Pi removal (b27cecc795, #76/#77).
 */

export type SessionRunHandle = {
  startedAt: number;
  pid?: number;
  sessionKey: string;
  agentId: string;
};

const ACTIVE_SESSION_RUNS = new Map<string, SessionRunHandle>();

/** Check whether a session currently has an active CLI agent turn. */
export function isSessionRunActive(sessionKey: string): boolean {
  return ACTIVE_SESSION_RUNS.has(sessionKey);
}

/** Return the number of currently active session runs. */
export function getActiveSessionRunCount(): number {
  return ACTIVE_SESSION_RUNS.size;
}

/** Register an active session run. */
export function registerSessionRun(sessionKey: string, handle: SessionRunHandle): void {
  ACTIVE_SESSION_RUNS.set(sessionKey, handle);
}

/** Unregister a session run (on turn completion or crash). */
export function unregisterSessionRun(sessionKey: string): void {
  ACTIVE_SESSION_RUNS.delete(sessionKey);
}

/** Reset registry — only for tests. */
export function resetSessionRunRegistryForTest(): void {
  ACTIVE_SESSION_RUNS.clear();
}
