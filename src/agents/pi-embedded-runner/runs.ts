/**
 * Stub for gutted pi-embedded-runner — no embedded runs exist in this fork.
 * Provides the API surface needed by gateway run-loop drain logic.
 */

export function getActiveEmbeddedRunCount(): number {
  return 0;
}

export function abortEmbeddedPiRun(
  _sessionId?: string,
  _opts?: { mode?: "all" | "compacting" },
): boolean {
  return false;
}

export async function waitForActiveEmbeddedRuns(_timeoutMs: number): Promise<{ drained: boolean }> {
  return { drained: true };
}
