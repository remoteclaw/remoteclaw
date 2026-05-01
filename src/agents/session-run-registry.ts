/**
 * In-process registry tracking which sessions currently have an active
 * CLI agent subprocess (ChannelBridge turn).
 *
 * Replaces the conceptual role of the former engine's active-runs map
 * that was stubbed to false/0 during engine removal (b27cecc795, #76/#77).
 */

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  isSessionRunActive: "live",
  getActiveSessionRunCount: "live",
  registerSessionRun: "live",
  unregisterSessionRun: "live",
  getSessionRunHandle: "live",
  killSessionRun: "live",
  waitForSessionRunEnd: "live",
  resetSessionRunRegistryForTest: "live",
} as const;

export type SessionRunHandle = {
  startedAt: number;
  pid?: number;
  sessionKey: string;
  agentId: string;
  abortController?: AbortController;
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

/** Retrieve the handle for an active session run, if any. */
export function getSessionRunHandle(sessionKey: string): SessionRunHandle | undefined {
  return ACTIVE_SESSION_RUNS.get(sessionKey);
}

/**
 * Kill an active session run by aborting its controller or sending SIGTERM to its PID.
 * Returns `true` if a kill signal was dispatched.
 */
export function killSessionRun(sessionKey: string): boolean {
  const handle = ACTIVE_SESSION_RUNS.get(sessionKey);
  if (!handle) {
    return false;
  }
  if (handle.abortController && !handle.abortController.signal.aborted) {
    handle.abortController.abort();
    return true;
  }
  if (typeof handle.pid === "number") {
    try {
      process.kill(handle.pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Wait (poll) for a session run to end.
 * Resolves `true` if the run ended, `false` on timeout.
 */
export async function waitForSessionRunEnd(sessionKey: string, timeoutMs: number): Promise<boolean> {
  if (!ACTIVE_SESSION_RUNS.has(sessionKey)) {
    return true;
  }
  const deadline = Date.now() + timeoutMs;
  while (ACTIVE_SESSION_RUNS.has(sessionKey)) {
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

/** Reset registry — only for tests. */
export function resetSessionRunRegistryForTest(): void {
  ACTIVE_SESSION_RUNS.clear();
}
