// Stub: gutted upstream embedded Pi agent — RemoteClaw does not use Pi.

export function abortEmbeddedPiRun(_sessionId: string): void {
  // no-op
}

export async function waitForEmbeddedPiRunEnd(
  _sessionId: string,
  _timeoutMs: number,
): Promise<boolean> {
  return true;
}
