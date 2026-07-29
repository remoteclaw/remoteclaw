import { describe, expect, it } from "vitest";
import { didSendDefinitelyNotLand, isPermanentDeliveryError } from "./send-outcome.js";

function classify(params: {
  platformSendAttempted?: boolean;
  error?: unknown;
  describedError?: string;
}): boolean {
  return didSendDefinitelyNotLand({
    platformSendAttempted: params.platformSendAttempted ?? true,
    error: params.error ?? new Error("boom"),
    describedError: params.describedError ?? "boom",
  });
}

function errnoError(code: string): Error & { code: string } {
  return Object.assign(new Error(`connect ${code}`), { code });
}

describe("didSendDefinitelyNotLand", () => {
  it("treats a failure raised before any send as definitely not landed", () => {
    // Payload normalization, a message_sending hook, handler construction, an
    // abort checked ahead of the first write — nothing reached the transport, so
    // the entry is safe to replay whole.
    expect(classify({ platformSendAttempted: false })).toBe(true);
  });

  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])(
    "treats %s as definitely not landed — the connection never carried a request",
    (code) => {
      expect(classify({ error: errnoError(code) })).toBe(true);
    },
  );

  it("finds the errno under a fetch wrapper", () => {
    // undici reports a refused connection as `TypeError: fetch failed` with the
    // real errno one level down. Reading only the thrown error's own `code`
    // would classify every fetch-based channel's refusals as ambiguous.
    const wrapped = Object.assign(new TypeError("fetch failed"), {
      cause: errnoError("ECONNREFUSED"),
    });
    expect(classify({ error: wrapped })).toBe(true);
  });

  it.each(["ECONNRESET", "EPIPE", "ETIMEDOUT"])(
    "treats %s as AMBIGUOUS — it can surface after the request was written",
    (code) => {
      expect(classify({ error: errnoError(code) })).toBe(false);
    },
  );

  it("treats a platform rejection as definitely not landed", () => {
    // The platform answered and refused. That is a rejection, not an ambiguity —
    // routing it to a human's reconciliation queue would bury a guaranteed
    // non-delivery among the genuinely undetermined ones.
    expect(
      classify({
        error: new Error("Bad Request: chat not found"),
        describedError: "Bad Request: chat not found",
      }),
    ).toBe(true);
  });

  it("treats a bare AbortError as AMBIGUOUS", () => {
    // A name-based abort check cannot tell a caller cancellation from a
    // transport that aborts its own controller on timeout (BlueBubbles' fetch
    // does exactly that, #3049). Only a send verified against the CALLER's own
    // AbortSignal is a clean discard, and that check lives in deliver.ts.
    const err = new DOMException("This operation was aborted", "AbortError");
    expect(classify({ error: err, describedError: "This operation was aborted" })).toBe(false);
  });

  it("treats an unrecognized transport failure as AMBIGUOUS", () => {
    // The default has to be "we cannot tell". An unknown error that reached the
    // wire may have been delivered, and replaying it is how a recipient gets the
    // message twice.
    expect(classify({ error: new Error("socket hang up") })).toBe(false);
  });

  it("treats a 5xx after the request reached the platform as AMBIGUOUS", () => {
    expect(
      classify({
        error: new Error("Request failed with status 502"),
        describedError: "Request failed with status 502",
      }),
    ).toBe(false);
  });

  it("does not spin on a cyclic cause chain", () => {
    const a: { code?: string; cause?: unknown } = { code: "ENOSUCHCODE" };
    const b: { code?: string; cause?: unknown } = { code: "ENOSUCHCODE", cause: a };
    a.cause = b;
    expect(classify({ error: a })).toBe(false);
  });

  it("ignores a non-string code", () => {
    expect(classify({ error: { code: 111 } })).toBe(false);
  });

  it("handles a non-object error", () => {
    expect(classify({ error: "ECONNREFUSED", describedError: "ECONNREFUSED" })).toBe(false);
  });
});

describe("isPermanentDeliveryError", () => {
  // Moved out of delivery-queue.ts so deliver.ts can classify send outcomes
  // without importing the queue module; behavior is unchanged.
  it("matches a known permanent rejection", () => {
    expect(isPermanentDeliveryError("Bad Request: chat not found")).toBe(true);
  });

  it("does not match a transient transport error", () => {
    expect(isPermanentDeliveryError("socket hang up")).toBe(false);
  });
});
