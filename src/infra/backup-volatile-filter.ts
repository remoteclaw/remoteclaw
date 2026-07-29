// Filters volatile files from backup manifests.
import path from "node:path";

/**
 * Paths that are known to change during a live backup and commonly trigger
 * tar EOF errors. These files are actively appended to (logs, sockets, pid
 * markers) while `tar.c()` is reading them, which races with the size recorded
 * at `lstat()` time.
 *
 * Skipping them is safe: they are either recreated on startup, are transient
 * by nature, or have durable equivalents elsewhere in state. Snapshotting a
 * partial tail of a live log has no restoration value.
 */

const STATE_TRANSIENT_EXTENSIONS = new Set([".sock", ".pid", ".tmp"]);

function normalizePosix(input: string): string {
  if (!input) {
    return input;
  }
  // Swap Windows-style separators, then collapse `.`/`..` segments so ancestry
  // checks cannot be bypassed by a path that traverses out of the anchor.
  return path.posix.normalize(input.replaceAll("\\", "/"));
}

function isUnder(childPosix: string, parentPosix: string): boolean {
  if (!parentPosix) {
    return false;
  }
  const p = parentPosix.endsWith("/") ? parentPosix : `${parentPosix}/`;
  return childPosix === parentPosix || childPosix.startsWith(p);
}

function hasExtension(filePosix: string, extensions: readonly string[]): boolean {
  const ext = path.posix.extname(filePosix).toLowerCase();
  return extensions.includes(ext);
}

function hasExtensionInSet(filePosix: string, extensions: ReadonlySet<string>): boolean {
  return extensions.has(path.posix.extname(filePosix).toLowerCase());
}

function isAgentSessionTranscriptPath(filePosix: string, stateDirPosix: string): boolean {
  const agentsRoot = path.posix.join(stateDirPosix, "agents");
  if (!isUnder(filePosix, agentsRoot)) {
    return false;
  }
  const relative = path.posix.relative(agentsRoot, filePosix);
  const parts = relative.split("/").filter(Boolean);
  return parts.length >= 3 && parts[1] === "sessions";
}

function filePathCandidates(input: string): string[] {
  const normalized = normalizePosix(input);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return [normalized];
  }
  // node-tar may pass absolute input paths to filters without the leading
  // slash, even when the source list used absolute paths.
  return [normalized, normalizePosix(`/${normalized}`)];
}

export type VolatileFilterPlan = {
  /** Canonical state directories the filter should treat as volatile anchors. */
  stateDirs: string[];
};

/**
 * Returns true if the given absolute path should be skipped during backup
 * because it is a live-mutation target.
 *
 * Rules:
 *   - `{stateDir}/sessions/**`/`*.{jsonl,log}` (legacy)
 *   - `{stateDir}/agents/<agentId>/sessions/**`/`*.{jsonl,log}`
 *   - `{stateDir}/cron/runs/**`/`*.{jsonl,log}`
 *   - `{stateDir}/logs/**`/`*.{jsonl,log}`
 *   - `{stateDir}/{delivery-queue,session-delivery-queue}/**`/`*.{json,delivered,tmp}`,
 *     EXCEPT `delivery-queue/needs-review/**` — see below
 *   - `{stateDir}/**`/`*.{sock,pid,tmp}`
 */
export function isVolatileBackupPath(absolutePath: string, plan: VolatileFilterPlan): boolean {
  if (!absolutePath) {
    return false;
  }
  const candidates = filePathCandidates(absolutePath);

  for (const stateDir of plan.stateDirs) {
    if (!stateDir) {
      continue;
    }
    const stateDirPosix = normalizePosix(stateDir);

    for (const filePosix of candidates) {
      const sessionsRoot = path.posix.join(stateDirPosix, "sessions");
      if (isUnder(filePosix, sessionsRoot) && hasExtension(filePosix, [".jsonl", ".log"])) {
        return true;
      }

      if (
        isAgentSessionTranscriptPath(filePosix, stateDirPosix) &&
        hasExtension(filePosix, [".jsonl", ".log"])
      ) {
        return true;
      }

      const cronRunsRoot = path.posix.join(stateDirPosix, "cron", "runs");
      if (isUnder(filePosix, cronRunsRoot) && hasExtension(filePosix, [".jsonl", ".log"])) {
        return true;
      }

      const logsRoot = path.posix.join(stateDirPosix, "logs");
      if (isUnder(filePosix, logsRoot) && hasExtension(filePosix, [".jsonl", ".log"])) {
        return true;
      }

      // Deliveries awaiting manual reconciliation are the one part of the queue
      // that is NOT volatile: they are terminal, unique, and the only record
      // that a message's delivery outcome is undetermined. Losing them on a
      // restore loses the operator's to-do list with no trace it existed.
      // ("awaiting review", not "pending" — in the queue's own vocabulary a
      // pending entry is one still queued to send, the opposite of this.)
      //
      // Sensitivity note: these entries carry the undelivered message PAYLOAD
      // and the recipient identifier, so this carve-out puts message content
      // into every backup — and backups travel off-box with long retention,
      // unlike the 0700 live state dir. That trade is deliberate and documented
      // for operators in `docs/gateway/message-delivery.md` § Backups contain
      // undelivered message content, which is also where the reconcile/prune
      // expectation that keeps the exposure bounded lives. Narrowing this
      // carve-out means re-reading that page, not just this comment.
      // `session-delivery-queue/needs-review` is intentionally NOT carved out:
      // the session queue has no quarantine concept today, so there is nothing
      // there to preserve. Revisit this carve-out if it gains one — otherwise
      // those entries would be silently filtered out of backups.
      const needsReviewRoot = path.posix.join(stateDirPosix, "delivery-queue", "needs-review");
      const isAwaitingReview = isUnder(filePosix, needsReviewRoot);

      if (!isAwaitingReview) {
        for (const queueDir of ["delivery-queue", "session-delivery-queue"]) {
          const queueRoot = path.posix.join(stateDirPosix, queueDir);
          if (
            isUnder(filePosix, queueRoot) &&
            hasExtension(filePosix, [".json", ".delivered", ".tmp"])
          ) {
            return true;
          }
        }
      }

      if (
        isUnder(filePosix, stateDirPosix) &&
        hasExtensionInSet(filePosix, STATE_TRANSIENT_EXTENSIONS)
      ) {
        return true;
      }
    }
  }

  return false;
}
