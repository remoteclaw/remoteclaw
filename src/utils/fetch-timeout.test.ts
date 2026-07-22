import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.hoisted(() => vi.fn());

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: vi.fn(() => ({
    warn,
  })),
}));

import { buildTimeoutAbortSignal, fetchWithTimeout } from "./fetch-timeout.js";
import { MAX_SAFE_TIMEOUT_DELAY_MS } from "./timer-delay.js";

function requireWarnCall(callIndex: number): [string, Record<string, unknown>] {
  const call = warn.mock.calls[callIndex];
  if (!call) {
    throw new Error(`missing warning call ${callIndex}`);
  }
  const [message, record] = call;
  if (typeof message !== "string" || !record || typeof record !== "object") {
    throw new Error(`invalid warning call ${callIndex}`);
  }
  return [message, record as Record<string, unknown>];
}

function requireWarnMessage(callIndex: number): string {
  const [message] = requireWarnCall(callIndex);
  return message;
}

function requireWarnRecord(callIndex: number): Record<string, unknown> {
  const [, record] = requireWarnCall(callIndex);
  return record;
}

describe("buildTimeoutAbortSignal", () => {
  beforeEach(() => {
    warn.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs when its own timeout aborts the signal", async () => {
    const { signal, cleanup } = buildTimeoutAbortSignal({
      timeoutMs: 25,
      operation: "unit-test",
      url: "https://user:pass@example.com/v1/responses?api-key=secret#fragment",
    });

    await vi.advanceTimersByTimeAsync(25);

    expect(signal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(requireWarnMessage(0)).toBe("fetch timeout reached; aborting operation");
    const record = requireWarnRecord(0);
    expect(record.timeoutMs).toBe(25);
    expect(record.operation).toBe("unit-test");
    expect(record.url).toBe("https://example.com/v1/responses");
    expect(record.consoleMessage).toBe(
      "fetch timeout after 25ms (elapsed 25ms) operation=unit-test url=https://example.com/v1/responses",
    );

    cleanup();
  });

  it("strips query strings and hashes from relative timeout URL logs", async () => {
    const { cleanup } = buildTimeoutAbortSignal({
      timeoutMs: 25,
      operation: "unit-test",
      url: "/api/responses?api-key=secret#fragment",
    });

    await vi.advanceTimersByTimeAsync(25);

    expect(requireWarnMessage(0)).toBe("fetch timeout reached; aborting operation");
    expect(requireWarnRecord(0).url).toBe("/api/responses");

    cleanup();
  });

  it("tags fetch timeout aborts so callers can distinguish them from parent aborts", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("missing signal"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(toLintErrorObject(signal.reason, "Non-Error rejection")),
            { once: true },
          );
        }),
    );

    const result = fetchWithTimeout("https://example.com/v1/audio", {}, 25, fetchFn);
    const assertion = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
      message: "request timed out",
    });
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });

  it("clamps oversized fetchWithTimeout delays before fetch starts", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const response = new Response("ok");
    const fetchFn = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal?.aborted).toBe(false);
      return response;
    });

    try {
      await expect(
        fetchWithTimeout("https://example.com/v1/slow", {}, MAX_SAFE_TIMEOUT_DELAY_MS + 1, fetchFn),
      ).resolves.toBe(response);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(timeoutSpy.mock.calls[0]?.[1]).toBe(MAX_SAFE_TIMEOUT_DELAY_MS);
      expect(timeoutSpy.mock.calls[0]?.[3]).toBe(MAX_SAFE_TIMEOUT_DELAY_MS);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("does not log when a parent signal aborts first", async () => {
    const parent = new AbortController();
    const { signal, cleanup } = buildTimeoutAbortSignal({
      timeoutMs: 25,
      signal: parent.signal,
      operation: "unit-test",
    });

    parent.abort();
    await vi.advanceTimersByTimeAsync(25);

    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).not.toMatchObject({ name: "TimeoutError" });
    expect(warn).not.toHaveBeenCalled();

    cleanup();
  });

  it("clamps oversized timeouts before arming Node timers", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const { signal, cleanup } = buildTimeoutAbortSignal({
      timeoutMs: MAX_SAFE_TIMEOUT_DELAY_MS + 1,
      operation: "unit-test",
    });

    try {
      expect(timeoutSpy.mock.calls[0]?.[1]).toBe(MAX_SAFE_TIMEOUT_DELAY_MS);
      expect(timeoutSpy.mock.calls[0]?.[3]).toBe(MAX_SAFE_TIMEOUT_DELAY_MS);

      await vi.advanceTimersByTimeAsync(1);

      expect(signal?.aborted).toBe(false);
    } finally {
      cleanup();
      timeoutSpy.mockRestore();
    }
  });
});

function toLintErrorObject(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === "string") {
    return new Error(value);
  }
  const error = new Error(fallbackMessage, { cause: value });
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    Object.assign(error, value);
  }
  return error;
}
