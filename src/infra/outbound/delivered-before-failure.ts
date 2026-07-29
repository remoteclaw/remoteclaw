/**
 * How far a failed send got, carried on the error itself.
 *
 * A caller that only sees a rejected promise cannot tell a total failure (safe
 * to replay whole) from a partial one (replaying re-sends what already arrived).
 * The sender knows, so it annotates the error on the way out and the queue's
 * recovery pass reads it back.
 *
 * Two facts travel this way, and they answer different questions:
 *
 * - how many payloads LANDED ({@link annotateDeliveredBeforeFailure}) — "is a
 *   whole replay safe, or would it re-send what already arrived?";
 * - whether a platform send was ATTEMPTED
 *   ({@link annotatePlatformSendAttempted}) — "with nothing landed, did this
 *   failure PROVE nothing arrived, or is the outcome merely unobserved?"
 *
 * Both are needed: with the count alone a caller cannot reconstruct
 * `didSendDefinitelyNotLand` (`send-outcome.ts`), so it must treat every
 * nothing-landed failure as a clean one and replay it — which is exactly how an
 * ambiguous send becomes a duplicate (#3061).
 *
 * Its own module rather than part of `delivery-queue.ts` so `deliver.ts` can use
 * it without importing the queue: `deliver.test.ts` mocks the queue module
 * wholesale, and a mocked annotation would make a broken one untestable.
 */

const DELIVERED_BEFORE_FAILURE_KEY = "remoteClawDeliveredBeforeFailure";
const PLATFORM_SEND_ATTEMPTED_KEY = "remoteClawPlatformSendAttempted";

/**
 * Record how many payloads reached the platform before the send failed.
 *
 * Non-enumerable so it does not leak into `JSON.stringify` of the error, and
 * returns the same error so it can be used inline at a `throw`.
 */
export function annotateDeliveredBeforeFailure<T>(err: T, deliveredCount: number): T {
  if (err && typeof err === "object") {
    try {
      Object.defineProperty(err, DELIVERED_BEFORE_FAILURE_KEY, {
        value: deliveredCount,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    } catch {
      // Frozen or non-extensible error. Losing the annotation costs precision;
      // throwing here would replace the real delivery failure with a TypeError.
    }
  }
  return err;
}

/**
 * Read the annotation left by {@link annotateDeliveredBeforeFailure}.
 *
 * `undefined` means the sender did not report one — not that nothing landed.
 * Callers must decide what an unreported outcome means for them.
 */
export function readDeliveredBeforeFailure(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const value = (err as Record<string, unknown>)[DELIVERED_BEFORE_FAILURE_KEY];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Record whether any platform send call was ENTERED before the send failed.
 *
 * The sibling of {@link annotateDeliveredBeforeFailure}, and deliberately a
 * second key rather than a widened first one: the two are written together but
 * mean different things, and a reader that only needs one should not have to
 * know the other's shape.
 *
 * This is the input `didSendDefinitelyNotLand` (`send-outcome.ts`) cannot
 * recover from the error alone. A failure raised before the first send —
 * payload normalization, a `message_sending` hook, handler construction, an
 * abort checked ahead of the first write — definitely did not land and is safe
 * to replay; one raised after the request hit the wire may have landed and is
 * not. Both surface as "nothing landed", so without this flag the two are
 * indistinguishable across the throw.
 *
 * Non-enumerable for the same reason as the count: it must not leak into
 * `JSON.stringify` of the error, and it returns the error so it can be used
 * inline at a `throw`.
 */
export function annotatePlatformSendAttempted<T>(err: T, platformSendAttempted: boolean): T {
  if (err && typeof err === "object") {
    try {
      Object.defineProperty(err, PLATFORM_SEND_ATTEMPTED_KEY, {
        value: platformSendAttempted,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    } catch {
      // Frozen or non-extensible error. Losing the annotation costs precision;
      // throwing here would replace the real delivery failure with a TypeError.
    }
  }
  return err;
}

/**
 * Read the annotation left by {@link annotatePlatformSendAttempted}.
 *
 * `undefined` means the sender did not report one — not that no send was
 * attempted. Callers must decide what an unreported outcome means for them; the
 * conservative reading depends on what they do with it, so this module does not
 * pick a default on their behalf.
 */
export function readPlatformSendAttempted(err: unknown): boolean | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const value = (err as Record<string, unknown>)[PLATFORM_SEND_ATTEMPTED_KEY];
  return typeof value === "boolean" ? value : undefined;
}
