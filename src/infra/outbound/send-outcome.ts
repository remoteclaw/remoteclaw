/**
 * What a failed send tells us about whether the message reached the recipient.
 *
 * The delivery queue has exactly two dispositions for a failure and they are
 * opposites: re-arm a replay (correct only when the send definitely did NOT
 * land) or quarantine it for a human (correct whenever it might have). This
 * module owns the predicate that chooses between them.
 *
 * Its own module rather than part of `delivery-queue.ts` so `deliver.ts` can use
 * it without importing the queue: `deliver.test.ts` mocks the queue module
 * wholesale, and a mocked classifier would make a broken one untestable — the
 * same reason `delivered-before-failure.ts` is separate.
 *
 * This narrows the duplicate window; it does not close it. See `delivery-queue.ts`
 * § Delivery semantics for the at-least-once contract this operates under.
 */

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

/**
 * A platform-level rejection that retrying can never satisfy: the chat is gone,
 * the recipient blocked us, the app lacks a scope. Retrying is pointless, and —
 * the property this module cares about — the platform told us it did not accept
 * the message, so nothing was delivered.
 */
export function isPermanentDeliveryError(error: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some((re) => re.test(error));
}

/**
 * Errno codes produced strictly BEFORE any byte of the request is written: the
 * name never resolved, or the connection was refused. A send that fails with one
 * of these cannot have been delivered, so replaying it cannot duplicate.
 *
 * Deliberately tiny, and deliberately not a per-error-code classification matrix
 * (#3051 rules one out): a code only belongs here if it is provably
 * pre-transmission. `ECONNRESET`, `EPIPE` and `ETIMEDOUT` are absent on purpose —
 * each can surface after the request was written, which is exactly the ambiguity
 * this guard exists to catch. Under-inclusion is the safe error here: an
 * unlisted pre-transmission code costs an operator one needless reconciliation,
 * while a wrongly-listed post-transmission code costs a recipient a duplicate.
 */
const CONNECTION_NEVER_ESTABLISHED_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * Bound on the `cause` walk below. `fetch` reports a refused connection as
 * `TypeError: fetch failed` with the real errno one level down, so the walk has
 * to go deeper than the thrown error — but a cyclic or adversarially-nested
 * `cause` chain must not spin.
 */
const MAX_ERROR_CAUSE_DEPTH = 5;

function hasConnectionNeverEstablishedCode(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== "object") {
      return false;
    }
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CONNECTION_NEVER_ESTABLISHED_CODES.has(code)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Whether this failure proves the message did not reach the recipient.
 *
 * `true` means the entry can go back on the retry path: a replay cannot
 * duplicate, because nothing was delivered. `false` means the outcome is
 * genuinely unknown and the entry must be surfaced for review rather than
 * silently re-sent (#3051 item 1).
 *
 * The binary is deliberately coarse — three questions, in order:
 *
 * 1. Did any send call reach the transport at all? A failure raised before the
 *    first send (payload normalization, a `message_sending` hook, handler
 *    construction, an abort checked ahead of the first write) definitely did not
 *    land.
 * 2. Did the connection fail to establish? See
 *    {@link CONNECTION_NEVER_ESTABLISHED_CODES}.
 * 3. Did the platform reject it outright? See {@link isPermanentDeliveryError} —
 *    "chat not found" is a rejection, not an ambiguity, and routing it to a
 *    human's reconciliation queue would bury a guaranteed non-delivery in the
 *    one place reserved for genuinely undetermined ones.
 *
 * Everything else — a timeout, a reset, a 5xx, an unrecognized transport
 * error — is treated as MAYBE-LANDED. That is the conservative direction: the
 * cost is an operator looking at an entry that turns out to have failed cleanly;
 * the cost of the opposite mistake is a recipient receiving the message twice.
 *
 * Note on `AbortError`: not special-cased here. A name-based abort check cannot
 * distinguish a caller cancellation from a transport that aborts its own
 * controller on timeout (BlueBubbles' fetch does exactly that, #3049), so only a
 * genuinely caller-cancelled send — verified against the caller's own
 * `AbortSignal`, upstream in `deliver.ts` — is treated as a clean discard. A
 * bare `AbortError` reaching here is ambiguous and stays ambiguous.
 */
export function didSendDefinitelyNotLand(params: {
  /** Whether any platform send call was entered before the failure. */
  platformSendAttempted: boolean;
  /** The thrown error, for errno inspection. */
  error: unknown;
  /** `describeDeliveryError(error)`, for the permanent-rejection patterns. */
  describedError: string;
}): boolean {
  if (!params.platformSendAttempted) {
    return true;
  }
  if (hasConnectionNeverEstablishedCode(params.error)) {
    return true;
  }
  return isPermanentDeliveryError(params.describedError);
}
