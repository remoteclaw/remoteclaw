/** Resolves and validates session-target keys used by cron jobs and delivery. */
const INVALID_CRON_SESSION_TARGET_ID_ERROR = "invalid cron sessionTarget session id";

export function isInvalidCronSessionTargetIdError(error: unknown): boolean {
  return error instanceof Error && error.message === INVALID_CRON_SESSION_TARGET_ID_ERROR;
}

export function assertSafeCronSessionTargetId(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (!trimmed) {
    throw new Error(INVALID_CRON_SESSION_TARGET_ID_ERROR);
  }
  // Fork-stricter guard (do NOT relax to upstream's null-byte-only check):
  // reject path separators so a persisted/custom `session:<id>` target cannot
  // smuggle path traversal (`session:../../outside`) into session-key/store
  // resolution. Restored after the v2026.5.27 mechanical apply adopted the
  // weaker upstream form.
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
    throw new Error(INVALID_CRON_SESSION_TARGET_ID_ERROR);
  }
  return trimmed;
}

export function resolveCronSessionTargetSessionKey(
  sessionTarget?: string | null,
): string | undefined {
  if (typeof sessionTarget !== "string" || !sessionTarget.startsWith("session:")) {
    return undefined;
  }
  return assertSafeCronSessionTargetId(sessionTarget.slice(8));
}

export function resolveCronCurrentSessionTarget(params: {
  sessionTarget?: string | null;
  sessionKey?: string | null;
}): string | undefined {
  if (params.sessionTarget !== "current") {
    return params.sessionTarget ?? undefined;
  }
  const sessionKey = params.sessionKey?.trim();
  return sessionKey ? `session:${assertSafeCronSessionTargetId(sessionKey)}` : "isolated";
}

export function resolveCronDeliverySessionKey(job: {
  sessionTarget?: string | null;
  sessionKey?: string | null;
}): string | undefined {
  const sessionTargetKey = resolveCronSessionTargetSessionKey(job.sessionTarget);
  if (sessionTargetKey) {
    return sessionTargetKey;
  }
  return typeof job.sessionKey === "string" && job.sessionKey.trim()
    ? job.sessionKey.trim()
    : undefined;
}

export function resolveCronNotificationSessionKey(params: {
  jobId: string;
  sessionKey?: string | null;
}): string {
  return typeof params.sessionKey === "string" && params.sessionKey.trim()
    ? params.sessionKey.trim()
    : `cron:${params.jobId}:failure`;
}
