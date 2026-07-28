/**
 * How far a failed send got, carried on the error itself.
 *
 * A caller that only sees a rejected promise cannot tell a total failure (safe
 * to replay whole) from a partial one (replaying re-sends what already arrived).
 * The sender knows, so it annotates the error on the way out and the queue's
 * recovery pass reads it back.
 *
 * Its own module rather than part of `delivery-queue.ts` so `deliver.ts` can use
 * it without importing the queue: `deliver.test.ts` mocks the queue module
 * wholesale, and a mocked annotation would make a broken one untestable.
 */

const DELIVERED_BEFORE_FAILURE_KEY = "remoteClawDeliveredBeforeFailure";

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
