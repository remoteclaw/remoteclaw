import fs from "node:fs";
import path from "node:path";
import type { ReplyPayload } from "../../auto-reply/types.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import { generateSecureUuid } from "../secure-random.js";
import {
  annotateDeliveredBeforeFailure,
  readDeliveredBeforeFailure,
} from "./delivered-before-failure.js";
import { describeDeliveryError } from "./describe-delivery-error.js";
import type { OutboundChannel } from "./targets.js";

const QUEUE_DIRNAME = "delivery-queue";
const FAILED_DIRNAME = "failed";
const NEEDS_REVIEW_DIRNAME = "needs-review";
const MAX_RETRIES = 5;

/** Backoff delays in milliseconds indexed by retry count (1-based). */
const BACKOFF_MS: readonly number[] = [
  5_000, // retry 1: 5s
  25_000, // retry 2: 25s
  120_000, // retry 3: 2m
  600_000, // retry 4: 10m
];

type DeliveryMirrorPayload = {
  sessionKey: string;
  agentId?: string;
  text?: string;
  mediaUrls?: string[];
};

type QueuedDeliveryPayload = {
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  /**
   * Original payloads before plugin hooks. On recovery, hooks re-run on these
   * payloads — this is intentional since hooks are stateless transforms and
   * should produce the same result on replay.
   */
  payloads: ReplyPayload[];
  threadId?: string | number | null;
  replyToId?: string | null;
  bestEffort?: boolean;
  gifPlayback?: boolean;
  silent?: boolean;
  mirror?: DeliveryMirrorPayload;
};

/**
 * Where an entry sits relative to the platform send, so recovery can tell
 * "never sent" apart from "maybe sent, outcome unknown".
 *
 * - `send_attempt_started` — written immediately before the platform send. If a
 *   crash leaves this on disk, the send may or may not have landed on the wire.
 * - `unknown_after_send` — the verdict for a send that may already have landed:
 *   written by recovery when it quarantines an interrupted attempt, and by
 *   {@link failPartialDelivery} when a send delivered part of its payloads and
 *   then failed — which is an ordinary live send, not only a crash. Either way
 *   the entry is quarantined instead of replayed.
 *
 * Absent (`undefined`) means no send has been attempted since the entry was
 * enqueued or since its last observed failure — the entry is safe to replay.
 * Entries written before this field existed have no marker and keep the
 * historical replay behaviour.
 */
export type DeliveryRecoveryState = "send_attempt_started" | "unknown_after_send";

export interface QueuedDelivery extends QueuedDeliveryPayload {
  id: string;
  enqueuedAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
  recoveryState?: DeliveryRecoveryState;
  /** Wall-clock ms when the platform send that set {@link recoveryState} began. */
  platformSendStartedAt?: number;
  /**
   * How many payloads reached the platform before the send failed. Recorded on
   * a partial send so whoever reconciles the entry knows which part arrived.
   */
  deliveredBeforeFailure?: number;
}

export type RecoverySummary = {
  recovered: number;
  failed: number;
  skippedMaxRetries: number;
  deferredBackoff: number;
  /** Entries with an unknown send outcome, quarantined instead of replayed. */
  needsReview: number;
  /** Entries with an unknown send outcome that could NOT be quarantined. */
  quarantineFailed: number;
  /** Entries skipped because another in-process worker held the claim. */
  skippedClaimed: number;
  /**
   * Entries already sitting in `needs-review/` when this pass STARTED, i.e.
   * quarantined by earlier passes. Unlike the counters above this is a standing
   * backlog, not an outcome of this run — it is what makes quarantined mail
   * visible on every startup rather than only the one that quarantined it.
   * The current total is `awaitingReviewAtStart + needsReview`.
   */
  awaitingReviewAtStart: number;
};

function resolveQueueDir(stateDir?: string): string {
  const base = stateDir ?? resolveStateDir();
  return path.join(base, QUEUE_DIRNAME);
}

function resolveFailedDir(stateDir?: string): string {
  return path.join(resolveQueueDir(stateDir), FAILED_DIRNAME);
}

/** Quarantine directory for entries whose send outcome could not be determined. */
export function resolveNeedsReviewDir(stateDir?: string): string {
  return path.join(resolveQueueDir(stateDir), NEEDS_REVIEW_DIRNAME);
}

function resolveQueueEntryPaths(
  id: string,
  stateDir?: string,
): {
  jsonPath: string;
  deliveredPath: string;
} {
  const queueDir = resolveQueueDir(stateDir);
  return {
    jsonPath: path.join(queueDir, `${id}.json`),
    deliveredPath: path.join(queueDir, `${id}.delivered`),
  };
}

function getErrnoCode(err: unknown): string | null {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code?: unknown }).code)
    : null;
}

async function unlinkBestEffort(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Best-effort cleanup.
  }
}

/** Atomically rewrite a queue entry in place (write tmp, then rename over). */
async function writeQueueEntryAtomic(filePath: string, entry: QueuedDelivery): Promise<void> {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(entry, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.promises.rename(tmp, filePath);
}

/** Read-modify-write a pending queue entry. Throws ENOENT if it is already gone. */
async function updateQueueEntry(
  id: string,
  stateDir: string | undefined,
  mutate: (entry: QueuedDelivery) => QueuedDelivery,
): Promise<void> {
  const filePath = path.join(resolveQueueDir(stateDir), `${id}.json`);
  const raw = await fs.promises.readFile(filePath, "utf-8");
  const entry: QueuedDelivery = JSON.parse(raw);
  await writeQueueEntryAtomic(filePath, mutate(entry));
}

/** Ensure the queue directory (and failed/ subdirectory) exist. */
export async function ensureQueueDir(stateDir?: string): Promise<string> {
  const queueDir = resolveQueueDir(stateDir);
  await fs.promises.mkdir(queueDir, { recursive: true, mode: 0o700 });
  await fs.promises.mkdir(resolveFailedDir(stateDir), { recursive: true, mode: 0o700 });
  return queueDir;
}

/** Persist a delivery entry to disk before attempting send. Returns the entry ID. */
type QueuedDeliveryParams = QueuedDeliveryPayload;

export async function enqueueDelivery(
  params: QueuedDeliveryParams,
  stateDir?: string,
): Promise<string> {
  const queueDir = await ensureQueueDir(stateDir);
  const id = generateSecureUuid();
  const entry: QueuedDelivery = {
    id,
    enqueuedAt: Date.now(),
    channel: params.channel,
    to: params.to,
    accountId: params.accountId,
    payloads: params.payloads,
    threadId: params.threadId,
    replyToId: params.replyToId,
    bestEffort: params.bestEffort,
    gifPlayback: params.gifPlayback,
    silent: params.silent,
    mirror: params.mirror,
    retryCount: 0,
  };
  await writeQueueEntryAtomic(path.join(queueDir, `${id}.json`), entry);
  return id;
}

/**
 * Record that delivery for `id` has entered the send path.
 *
 * This is the write that closes the duplicate-delivery window: if the process
 * dies anywhere between here and the matching ack/fail, the entry is left on
 * disk carrying `send_attempt_started`, and {@link recoverPendingDeliveries}
 * quarantines it instead of re-sending a message that may already have landed.
 *
 * The marked window is deliberately wider than the wire call — it opens before
 * payload normalization and the `message_sending` hook, so a crash before
 * anything reached the network still quarantines. Over-quarantining costs an
 * operator a look; under-marking costs a user a duplicate.
 *
 * Callers treat this as best-effort — a queue-write failure must not block the
 * delivery itself. The cost of a missed marker is the pre-existing replay
 * behaviour, not a new failure mode, but callers should say so in the log.
 */
export async function markDeliveryAttemptStarted(id: string, stateDir?: string): Promise<void> {
  await updateQueueEntry(id, stateDir, (entry) => ({
    ...entry,
    recoveryState: "send_attempt_started",
    platformSendStartedAt: Date.now(),
  }));
}

/** Drop the in-flight marker once the send outcome is definitively known. */
export async function clearDeliveryAttemptMarker(id: string, stateDir?: string): Promise<void> {
  await updateQueueEntry(id, stateDir, (entry) => ({
    ...entry,
    recoveryState: undefined,
    platformSendStartedAt: undefined,
  }));
}

/** True when the entry's send may have landed but was never acknowledged. */
export function hasUnknownSendOutcome(entry: QueuedDelivery): boolean {
  return (
    entry.recoveryState === "send_attempt_started" || entry.recoveryState === "unknown_after_send"
  );
}

/**
 * Quarantine an entry whose send outcome cannot be determined: stamp the
 * verdict onto the entry, then move it out of the pending scan into
 * `needs-review/` for an operator to reconcile by hand.
 *
 * Deliberately conservative — for a messaging product a message that silently
 * needs a human is strictly better than a message the recipient receives twice.
 */
export async function quarantineUnknownSend(id: string, stateDir?: string): Promise<void> {
  const queueDir = resolveQueueDir(stateDir);
  const needsReviewDir = resolveNeedsReviewDir(stateDir);
  await updateQueueEntry(id, stateDir, (entry) => ({
    ...entry,
    recoveryState: "unknown_after_send",
  }));
  await fs.promises.mkdir(needsReviewDir, { recursive: true, mode: 0o700 });
  await fs.promises.rename(
    path.join(queueDir, `${id}.json`),
    path.join(needsReviewDir, `${id}.json`),
  );
}

export type ActiveDeliveryClaimResult<T> =
  | { status: "claimed"; value: T }
  | { status: "claimed-by-other-owner" };

/**
 * In-process single-owner claim over one queue entry.
 *
 * Scope is deliberately in-process: it stops a recovery pass from draining an
 * entry that a live send (or a concurrent recovery pass) is already working on
 * within this gateway process. It is NOT a cross-process lock — the queue is
 * owned by one gateway per state directory, which is the same boundary the
 * session delivery queue's `entriesInProgress` guard assumes.
 */
const activeDeliveryClaims = new Set<string>();

export async function withActiveDeliveryClaim<T>(
  entryId: string,
  fn: () => Promise<T>,
): Promise<ActiveDeliveryClaimResult<T>> {
  if (activeDeliveryClaims.has(entryId)) {
    return { status: "claimed-by-other-owner" };
  }
  activeDeliveryClaims.add(entryId);
  try {
    return { status: "claimed", value: await fn() };
  } finally {
    activeDeliveryClaims.delete(entryId);
  }
}

/** Remove a successfully delivered entry from the queue.
 *
 * Uses a two-phase approach so that a crash between delivery and cleanup
 * does not cause the message to be replayed on the next recovery scan:
 *   Phase 1: atomic rename  {id}.json → {id}.delivered
 *   Phase 2: unlink the .delivered marker
 * If the process dies between phase 1 and phase 2 the marker is cleaned up
 * by {@link loadPendingDeliveries} on the next startup without re-sending.
 */
export async function ackDelivery(id: string, stateDir?: string): Promise<void> {
  const { jsonPath, deliveredPath } = resolveQueueEntryPaths(id, stateDir);
  try {
    // Phase 1: atomic rename marks the delivery as complete.
    await fs.promises.rename(jsonPath, deliveredPath);
  } catch (err) {
    const code = getErrnoCode(err);
    if (code === "ENOENT") {
      // .json already gone — may have been renamed by a previous ack attempt.
      // Try to clean up a leftover .delivered marker if present.
      await unlinkBestEffort(deliveredPath);
      return;
    }
    throw err;
  }
  // Phase 2: remove the marker file.
  await unlinkBestEffort(deliveredPath);
}

/**
 * Update a queue entry after a delivery attempt where no payload was observed
 * to reach the recipient, clearing the in-flight marker so the entry replays.
 *
 * The caller must establish that nothing landed — this function cannot tell.
 * A send that delivered some payloads and then failed is a different outcome
 * ({@link failPartialDelivery}); recording it here re-arms a replay that
 * re-sends whatever already arrived. Chunked text makes that ordinary: one
 * chunk lands, the next throws.
 *
 * Known residual: "no payload observed to land" is not the same as "nothing
 * reached the platform". A request that times out or resets *after* hitting the
 * wire produces no result object, so it is recorded here and replayed — the
 * queue's long-standing at-least-once behaviour for ambiguous transport errors.
 * Closing that needs transport-level error classification and is out of scope
 * for the crash-window fix (#2934).
 */
export async function failDelivery(id: string, error: string, stateDir?: string): Promise<void> {
  await updateQueueEntry(id, stateDir, (entry) => ({
    ...entry,
    retryCount: entry.retryCount + 1,
    lastAttemptAt: Date.now(),
    lastError: error,
    recoveryState: undefined,
    platformSendStartedAt: undefined,
  }));
}

/**
 * Update a queue entry after a send where some payloads landed and others did
 * not — a failed chunk mid-sequence, or a per-payload error under best-effort.
 *
 * Replaying such an entry re-sends the payloads that already arrived, which is
 * the same duplicate this queue's recovery path exists to prevent. So the entry
 * keeps an unknown-outcome marker and recovery quarantines it for a human
 * rather than retrying it whole.
 */
export async function failPartialDelivery(
  id: string,
  error: string,
  stateDir?: string,
  deliveredCount?: number,
): Promise<void> {
  await updateQueueEntry(id, stateDir, (entry) => ({
    ...entry,
    retryCount: entry.retryCount + 1,
    lastAttemptAt: Date.now(),
    lastError: error,
    recoveryState: "unknown_after_send",
    // Persist how far the send got: without it, whoever opens the quarantined
    // entry sees the full payload list and no way to tell which part arrived.
    deliveredBeforeFailure: deliveredCount,
  }));
}

/**
 * Load a single pending entry by id, or null if it is no longer pending.
 *
 * Recovery re-reads through this inside its claim: the scan snapshot is a
 * hypothesis about an entry, and by the time the claim is granted another owner
 * may have acked it, failed it, or stamped it in-flight.
 */
async function loadPendingDelivery(id: string, stateDir?: string): Promise<QueuedDelivery | null> {
  const { jsonPath } = resolveQueueEntryPaths(id, stateDir);
  try {
    const stat = await fs.promises.stat(jsonPath);
    if (!stat.isFile()) {
      return null;
    }
    const raw = await fs.promises.readFile(jsonPath, "utf-8");
    // Normalize in memory only — the scan already persisted any migration.
    return normalizeLegacyQueuedDeliveryEntry(JSON.parse(raw) as QueuedDelivery).entry;
  } catch (err) {
    if (getErrnoCode(err) === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/** Load all pending delivery entries from the queue directory. */
export async function loadPendingDeliveries(stateDir?: string): Promise<QueuedDelivery[]> {
  const queueDir = resolveQueueDir(stateDir);
  let files: string[];
  try {
    files = await fs.promises.readdir(queueDir);
  } catch (err) {
    const code = getErrnoCode(err);
    if (code === "ENOENT") {
      return [];
    }
    throw err;
  }
  // Clean up .delivered markers left by ackDelivery if the process crashed
  // between the rename and the unlink.
  for (const file of files) {
    if (!file.endsWith(".delivered")) {
      continue;
    }
    await unlinkBestEffort(path.join(queueDir, file));
  }

  const entries: QueuedDelivery[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(queueDir, file);
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as QueuedDelivery;
      const { entry, migrated } = normalizeLegacyQueuedDeliveryEntry(parsed);
      if (migrated) {
        await writeQueueEntryAtomic(filePath, entry);
      }
      entries.push(entry);
    } catch {
      // Skip malformed or inaccessible entries.
    }
  }
  return entries;
}

/** Move a queue entry to the failed/ subdirectory. */
export async function moveToFailed(id: string, stateDir?: string): Promise<void> {
  const queueDir = resolveQueueDir(stateDir);
  const failedDir = resolveFailedDir(stateDir);
  await fs.promises.mkdir(failedDir, { recursive: true, mode: 0o700 });
  const src = path.join(queueDir, `${id}.json`);
  const dest = path.join(failedDir, `${id}.json`);
  await fs.promises.rename(src, dest);
}

/** Compute the backoff delay in ms for a given retry count. */
export function computeBackoffMs(retryCount: number): number {
  if (retryCount <= 0) {
    return 0;
  }
  return BACKOFF_MS[Math.min(retryCount - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS.at(-1) ?? 0;
}

export function isEntryEligibleForRecoveryRetry(
  entry: QueuedDelivery,
  now: number,
): { eligible: true } | { eligible: false; remainingBackoffMs: number } {
  const backoff = computeBackoffMs(entry.retryCount + 1);
  if (backoff <= 0) {
    return { eligible: true };
  }
  const firstReplayAfterCrash = entry.retryCount === 0 && entry.lastAttemptAt === undefined;
  if (firstReplayAfterCrash) {
    return { eligible: true };
  }
  const hasAttemptTimestamp =
    typeof entry.lastAttemptAt === "number" &&
    Number.isFinite(entry.lastAttemptAt) &&
    entry.lastAttemptAt > 0;
  const baseAttemptAt = hasAttemptTimestamp
    ? (entry.lastAttemptAt ?? entry.enqueuedAt)
    : entry.enqueuedAt;
  const nextEligibleAt = baseAttemptAt + backoff;
  if (now >= nextEligibleAt) {
    return { eligible: true };
  }
  return { eligible: false, remainingBackoffMs: nextEligibleAt - now };
}

function normalizeLegacyQueuedDeliveryEntry(entry: QueuedDelivery): {
  entry: QueuedDelivery;
  migrated: boolean;
} {
  const hasAttemptTimestamp =
    typeof entry.lastAttemptAt === "number" &&
    Number.isFinite(entry.lastAttemptAt) &&
    entry.lastAttemptAt > 0;
  if (hasAttemptTimestamp || entry.retryCount <= 0) {
    return { entry, migrated: false };
  }
  const hasEnqueuedTimestamp =
    typeof entry.enqueuedAt === "number" &&
    Number.isFinite(entry.enqueuedAt) &&
    entry.enqueuedAt > 0;
  if (!hasEnqueuedTimestamp) {
    return { entry, migrated: false };
  }
  return {
    entry: {
      ...entry,
      lastAttemptAt: entry.enqueuedAt,
    },
    migrated: true,
  };
}

export type DeliverFn = (
  params: {
    cfg: RemoteClawConfig;
  } & QueuedDeliveryParams & {
      skipQueue?: boolean;
      /**
       * Called once per payload that failed under `bestEffort`, where the send
       * resolves instead of throwing. Recovery needs it: without it a retry in
       * which every payload failed looks identical to a clean success.
       */
      onError?: (err: unknown, payload: unknown) => void;
    },
) => Promise<unknown>;

export interface RecoveryLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

function createEmptyRecoverySummary(): RecoverySummary {
  return {
    recovered: 0,
    failed: 0,
    skippedMaxRetries: 0,
    deferredBackoff: 0,
    needsReview: 0,
    quarantineFailed: 0,
    skippedClaimed: 0,
    awaitingReviewAtStart: 0,
  };
}

/**
 * Count entries awaiting manual reconciliation. Never throws — an unreadable
 * quarantine directory must not stop recovery of the pending queue.
 */
async function countNeedsReviewEntries(stateDir?: string): Promise<number> {
  try {
    const files = await fs.promises.readdir(resolveNeedsReviewDir(stateDir));
    return files.filter((file) => file.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

/**
 * Whether the entry might still be pending. Deliberately conservative: an
 * unreadable entry answers `true`, so a caller using this to decide "was that
 * ENOENT because the entry is gone?" never mistakes an IO fault for a removal.
 */
async function pendingEntryMayStillExist(id: string, stateDir?: string): Promise<boolean> {
  try {
    return (await loadPendingDelivery(id, stateDir)) !== null;
  } catch {
    return true;
  }
}

function formatSendStartedAt(entry: QueuedDelivery): string {
  const startedAt = entry.platformSendStartedAt;
  return typeof startedAt === "number" && startedAt > 0
    ? new Date(startedAt).toISOString()
    : "an unrecorded time";
}

/**
 * Narrow the operator's reconciliation window when the sender reported how far
 * it got. Without it the log says "some or all of this may have arrived"; with
 * it, the first N parts are known-sent and only the rest are in question.
 *
 * Counts PLATFORM SENDS, not `payloads[]` entries: one payload of long text
 * becomes several chunked sends, and a media payload one send per URL. Rendering
 * it as a fraction of `payloads.length` produced impossible lines like
 * "2 of 1 payload(s)", so there is deliberately no denominator here.
 */
function describeDeliveredBeforeFailure(entry: QueuedDelivery): string {
  const landed = entry.deliveredBeforeFailure;
  if (typeof landed !== "number" || landed <= 0) {
    return "";
  }
  return ` (${landed} message part(s) confirmed sent before the failure)`;
}

/**
 * On gateway startup, scan the delivery queue and retry any pending entries.
 * Uses exponential backoff and moves entries that exceed MAX_RETRIES to failed/.
 *
 * Entries whose send outcome is unknown (the process died mid-send) are never
 * replayed — they are quarantined to `needs-review/` so a crash cannot turn
 * into a duplicate message on the recipient's device.
 */
export async function recoverPendingDeliveries(opts: {
  deliver: DeliverFn;
  log: RecoveryLogger;
  cfg: RemoteClawConfig;
  stateDir?: string;
  /** Maximum wall-clock time for recovery in ms. Remaining entries are deferred to next restart. Default: 60 000. */
  maxRecoveryMs?: number;
}): Promise<RecoverySummary> {
  // Report the standing backlog before anything else. Quarantining moves an
  // entry out of the pending scan, so without this the only startup that ever
  // mentions a quarantined message is the one that quarantined it — after a log
  // rotation an operator has no way to discover that mail is awaiting them.
  // Deliberately before the early return: a state dir with nothing pending and
  // ten quarantined entries is exactly when this matters most.
  const awaitingReviewAtStart = await countNeedsReviewEntries(opts.stateDir);
  if (awaitingReviewAtStart > 0) {
    opts.log.warn(
      `${awaitingReviewAtStart} delivery entr${awaitingReviewAtStart === 1 ? "y is" : "ies are"} awaiting manual reconciliation in ${resolveNeedsReviewDir(opts.stateDir)} — their send outcome is unknown and they will NOT be retried automatically`,
    );
  }

  const pending = await loadPendingDeliveries(opts.stateDir);
  if (pending.length === 0) {
    return { ...createEmptyRecoverySummary(), awaitingReviewAtStart };
  }

  // Process oldest first.
  pending.sort((a, b) => a.enqueuedAt - b.enqueuedAt);

  opts.log.info(`Found ${pending.length} pending delivery entries — starting recovery`);

  const deadline = Date.now() + (opts.maxRecoveryMs ?? 60_000);

  const summary = { ...createEmptyRecoverySummary(), awaitingReviewAtStart };

  for (const [index, entry] of pending.entries()) {
    const now = Date.now();
    if (now >= deadline) {
      // Everything from this entry onward is untouched — counting by position
      // rather than by summary totals stays correct no matter how many of the
      // per-entry outcomes are counted.
      const deferred = pending.length - index;
      opts.log.warn(`Recovery time budget exceeded — ${deferred} entries deferred to next restart`);
      break;
    }

    // The claim wraps the whole per-entry decision, not just the send. It is
    // what separates "another worker is on this right now" from "orphaned by a
    // crash" — deciding without it would quarantine entries that a live send is
    // still working, and re-drive entries another recovery pass already holds.
    const claim = await withActiveDeliveryClaim(entry.id, async () => {
      // Re-read under the claim. `entry` came from a scan taken before the claim
      // was granted, so it is only a hypothesis: another owner may have acked,
      // failed, or stamped the entry in-flight since. Deciding from the snapshot
      // is how a "never replay unknown outcomes" guarantee still ships a
      // duplicate. Same discipline as the session queue's per-entry re-read.
      let current: QueuedDelivery | null;
      try {
        current = await loadPendingDelivery(entry.id, opts.stateDir);
      } catch (err) {
        // Keep one unreadable entry from aborting the whole pass: the scan
        // already tolerates malformed entries per file, and recovery should too.
        opts.log.error(`Could not re-read delivery ${entry.id} — skipping it: ${String(err)}`);
        return;
      }
      if (!current) {
        // Acked or moved by whoever owned it — there is nothing left to recover.
        return;
      }

      // Duplicate suppression comes first: an entry whose send may already have
      // landed must never reach the retry path, whatever its retry/backoff state.
      if (hasUnknownSendOutcome(current)) {
        try {
          await quarantineUnknownSend(current.id, opts.stateDir);
        } catch (err) {
          // An ENOENT only means "already handled" if the entry is genuinely
          // gone. ENOENT from the mkdir (state dir pulled out from under a
          // running gateway) leaves it pending and must not pass silently.
          if (
            getErrnoCode(err) === "ENOENT" &&
            !(await pendingEntryMayStillExist(current.id, opts.stateDir))
          ) {
            return;
          }
          opts.log.error(
            `Delivery ${current.id} has an unknown send outcome but could not be moved to ${resolveNeedsReviewDir(opts.stateDir)} — it stays pending and will NOT be replayed: ${String(err)}`,
          );
          summary.quarantineFailed += 1;
          return;
        }
        // Two records on purpose: what happened, then what to do about it. One
        // combined line buries the incident under a four-step runbook.
        opts.log.warn(
          `Delivery ${current.id} to ${current.channel}:${current.to} was interrupted mid-send at ${formatSendStartedAt(current)}${describeDeliveredBeforeFailure(current)} — outcome unknown, refusing to replay. Moved to ${path.join(resolveNeedsReviewDir(opts.stateDir), `${current.id}.json`)}`,
        );
        opts.log.warn(
          `To reconcile delivery ${current.id}: check the recipient's message history around that time, then delete the file if it arrived. To send it after all, move the file back into ${resolveQueueDir(opts.stateDir)}, set its "recoveryState" to null and its "retryCount" to 0, then restart the gateway — recovery only runs at startup, leaving "recoveryState" set only re-quarantines it, and leaving "retryCount" at ${current.retryCount} (max ${MAX_RETRIES}) files it under failed/ without sending.`,
        );
        summary.needsReview += 1;
        return;
      }

      if (current.retryCount >= MAX_RETRIES) {
        opts.log.warn(
          `Delivery ${current.id} exceeded max retries (${current.retryCount}/${MAX_RETRIES}) — moving to failed/`,
        );
        try {
          await moveToFailed(current.id, opts.stateDir);
        } catch (err) {
          opts.log.error(`Failed to move entry ${current.id} to failed/: ${String(err)}`);
        }
        summary.skippedMaxRetries += 1;
        return;
      }

      const retryEligibility = isEntryEligibleForRecoveryRetry(current, Date.now());
      if (!retryEligibility.eligible) {
        summary.deferredBackoff += 1;
        opts.log.info(
          `Delivery ${current.id} not ready for retry yet — backoff ${retryEligibility.remainingBackoffMs}ms remaining`,
        );
        return;
      }

      // Recovery's own re-delivery opens the same crash window as the live send
      // path, so it takes the same marker: without this, a crash during recovery
      // would blind-replay on the next restart.
      try {
        await markDeliveryAttemptStarted(current.id, opts.stateDir);
      } catch (err) {
        if (getErrnoCode(err) === "ENOENT") {
          // The entry vanished after the re-read above. In-process that window
          // is closed (no await between the two), so this covers removal from
          // outside this process — a second gateway on the same state dir, or
          // an operator clearing the queue. Either way it is gone: sending now
          // is the duplicate.
          return;
        }
        // Any other write failure degrades to the pre-marker replay behaviour.
        // Say so: an operator cannot otherwise tell that duplicate suppression
        // is disarmed for this entry.
        opts.log.warn(
          `Could not record the send-in-flight marker for delivery ${current.id} — if this process dies mid-send the entry may be delivered twice: ${String(err)}`,
        );
      }

      // A `bestEffort` retry swallows per-payload errors and resolves, so
      // "did not throw" is not "arrived". Without this the recovery pass acks
      // an entry whose payloads all failed and the message is silently dropped.
      let sawPayloadFailure = false;
      let firstPayloadError: string | undefined;
      try {
        const sent = await opts.deliver({
          cfg: opts.cfg,
          channel: current.channel,
          to: current.to,
          accountId: current.accountId,
          payloads: current.payloads,
          threadId: current.threadId,
          replyToId: current.replyToId,
          bestEffort: current.bestEffort,
          gifPlayback: current.gifPlayback,
          silent: current.silent,
          mirror: current.mirror,
          skipQueue: true, // Prevent re-enqueueing during recovery
          onError: (err) => {
            sawPayloadFailure = true;
            firstPayloadError ??= describeDeliveryError(err);
          },
        });
        if (sawPayloadFailure) {
          // Route it exactly as a thrown failure would be: what already landed
          // decides between "retry it whole" and "a human has to reconcile it".
          const landed = Array.isArray(sent) ? sent.length : 0;
          throw annotateDeliveredBeforeFailure(
            new Error(
              `bestEffort delivery reported a per-payload failure: ${firstPayloadError ?? "unknown error"}`,
            ),
            landed,
          );
        }
        await ackDelivery(current.id, opts.stateDir);
        summary.recovered += 1;
        opts.log.info(`Recovered delivery ${current.id} to ${current.channel}:${current.to}`);
      } catch (err) {
        const errMsg = describeDeliveryError(err);
        // Recovery's own retry can land some payloads and then fail, exactly as
        // the live send path can. Clearing the marker here regardless would
        // re-arm a replay of the payloads that already arrived — the same
        // duplicate this function exists to prevent, one restart later.
        // An unreported count means the DeliverFn is not the outbound sender
        // and cannot tell us; treat that as the historical "replay whole".
        const landedBeforeFailure = readDeliveredBeforeFailure(err) ?? 0;

        // Checked BEFORE the permanent-error branch on purpose. "Permanent"
        // answers whether retrying can ever work; it does not answer whether
        // part of this message is already on the recipient's device. A chunked
        // send whose later chunk hits `chat not found` has both properties, and
        // filing it under failed/ ("never arrived") would be a lie.
        if (landedBeforeFailure > 0) {
          try {
            await failPartialDelivery(current.id, errMsg, opts.stateDir, landedBeforeFailure);
          } catch {
            // Best-effort update.
          }
          summary.failed += 1;
          opts.log.warn(
            `Retry for delivery ${current.id} failed after ${landedBeforeFailure} payload(s) had already been sent — it will be quarantined rather than replayed: ${errMsg}`,
          );
          return;
        }

        if (isPermanentDeliveryError(errMsg)) {
          opts.log.warn(
            `Delivery ${current.id} hit permanent error — moving to failed/: ${errMsg}`,
          );
          try {
            // Clear the in-flight marker first: a permanent error means the send
            // definitively did not land, and an operator triaging failed/ should
            // not read a stale "send may have landed" stamp.
            await clearDeliveryAttemptMarker(current.id, opts.stateDir).catch(() => {});
            await moveToFailed(current.id, opts.stateDir);
          } catch (moveErr) {
            opts.log.error(`Failed to move entry ${current.id} to failed/: ${String(moveErr)}`);
          }
          summary.failed += 1;
          return;
        }

        try {
          await failDelivery(current.id, errMsg, opts.stateDir);
        } catch {
          // Best-effort update.
        }
        summary.failed += 1;
        opts.log.warn(`Retry failed for delivery ${current.id}: ${errMsg}`);
      }
    });
    if (claim.status === "claimed-by-other-owner") {
      summary.skippedClaimed += 1;
      opts.log.info(`Delivery ${entry.id} is already being delivered by another worker — skipping`);
    }
  }

  opts.log.info(
    `Delivery recovery complete: ${summary.recovered} recovered, ${summary.failed} failed, ${summary.skippedMaxRetries} skipped (max retries), ${summary.deferredBackoff} deferred (backoff), ${summary.needsReview} quarantined (unknown send outcome), ${summary.quarantineFailed} stuck (quarantine failed), ${summary.skippedClaimed} skipped (claimed), ${summary.awaitingReviewAtStart + summary.needsReview} awaiting manual reconciliation`,
  );
  return summary;
}

export { MAX_RETRIES };

const PERMANENT_ERROR_PATTERNS: readonly RegExp[] = [
  /no conversation reference found/i,
  /chat not found/i,
  /user not found/i,
  /bot was blocked by the user/i,
  /forbidden: bot was kicked/i,
  /chat_id is empty/i,
  /recipient is not a valid/i,
  /outbound not configured for channel/i,
  /ambiguous discord recipient/i,
  // Slack: a required OAuth scope is missing from the app — cannot self-resolve
  // without app reconfiguration, so retries only waste attempts (#2098).
  /missing_scope/i,
];

export function isPermanentDeliveryError(error: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some((re) => re.test(error));
}
