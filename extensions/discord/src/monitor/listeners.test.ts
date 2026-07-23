// Discord tests cover listeners plugin behavior.
import { beforeAll, describe, expect, it, vi } from "vitest";

let DiscordMessageListener: typeof import("./listeners.js").DiscordMessageListener;

beforeAll(async () => {
  ({ DiscordMessageListener } = await import("./listeners.js"));
});

function createLogger() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function firstErrorMessage(logger: ReturnType<typeof createLogger>): string {
  const firstCall = logger.error.mock.calls[0];
  if (!firstCall) {
    throw new Error("expected logger.error call");
  }
  expect(firstCall).toHaveLength(1);
  return String(firstCall[0]);
}

function fakeEvent(channelId: string) {
  return { channel_id: channelId } as never;
}

function createDeferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("DiscordMessageListener", () => {
  it("returns immediately without awaiting handler completion", async () => {
    let resolveHandler: (() => void) | undefined;
    const handlerDone = new Promise<void>((resolve) => {
      resolveHandler = resolve;
    });
    const handler = vi.fn(async () => {
      await handlerDone;
    });
    const logger = createLogger();
    const listener = new DiscordMessageListener(handler as never, logger as never);

    await expect(listener.handle(fakeEvent("ch-1"), {} as never)).resolves.toBeUndefined();
    // Handler was dispatched but may not have been called yet (fire-and-forget).
    // Wait for the microtask to flush so the handler starts.
    await flushAsyncWork();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();

    resolveHandler?.();
    await handlerDone;
  });

  it("serializes handlers for the same channel to preserve ordering", async () => {
    const order: string[] = [];
    const deferredA = createDeferred();
    const deferredB = createDeferred();
    let callCount = 0;
    const handler = vi.fn(async () => {
      callCount += 1;
      const id = callCount;
      order.push(`start:${id}`);
      if (id === 1) {
        await deferredA.promise;
      } else {
        await deferredB.promise;
      }
      order.push(`end:${id}`);
    });
    const listener = new DiscordMessageListener(handler as never, createLogger() as never);

    // Both messages target the same channel — the fork serializes them via a
    // per-channel KeyedAsyncQueue to preserve ordering (see listeners.ts).
    await listener.handle(fakeEvent("ch-1"), {} as never);
    await listener.handle(fakeEvent("ch-1"), {} as never);

    await flushAsyncWork();
    // Only the first handler has started; the second is queued behind it.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(order).toContain("start:1");
    expect(order).not.toContain("start:2");

    // Completing the first releases the queue so the second can start.
    deferredA.resolve?.();
    for (let i = 0; i < 6; i += 1) {
      await flushAsyncWork();
    }
    expect(order).toContain("end:1");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(order).toContain("start:2");
    // Ordering preserved: the first fully finished before the second began.
    expect(order.indexOf("end:1")).toBeLessThan(order.indexOf("start:2"));

    deferredB.resolve?.();
    await flushAsyncWork();
    expect(order).toContain("end:2");
  });

  it("runs handlers for different channels in parallel", async () => {
    const deferredA = createDeferred();
    const deferredB = createDeferred();
    const order: string[] = [];
    const handler = vi.fn(async (data: { channel_id: string }) => {
      order.push(`start:${data.channel_id}`);
      if (data.channel_id === "ch-a") {
        await deferredA.promise;
      } else {
        await deferredB.promise;
      }
      order.push(`end:${data.channel_id}`);
    });
    const listener = new DiscordMessageListener(handler as never, createLogger() as never);

    await listener.handle(fakeEvent("ch-a"), {} as never);
    await listener.handle(fakeEvent("ch-b"), {} as never);

    await flushAsyncWork();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(order).toContain("start:ch-a");
    expect(order).toContain("start:ch-b");

    deferredB.resolve?.();
    await flushAsyncWork();
    expect(order).toContain("end:ch-b");
    expect(order).not.toContain("end:ch-a");

    deferredA.resolve?.();
    await flushAsyncWork();
    expect(order).toContain("end:ch-a");
  });

  it("logs async handler failures", async () => {
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    const logger = createLogger();
    const listener = new DiscordMessageListener(handler as never, logger as never);

    await expect(listener.handle(fakeEvent("ch-1"), {} as never)).resolves.toBeUndefined();
    await flushAsyncWork();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(firstErrorMessage(logger)).toContain("discord handler failed: Error: boom");
  });

  it("calls onEvent callback for each message", async () => {
    const handler = vi.fn(async () => {});
    const onEvent = vi.fn();
    const listener = new DiscordMessageListener(handler as never, undefined, onEvent);

    await listener.handle(fakeEvent("ch-1"), {} as never);
    await listener.handle(fakeEvent("ch-2"), {} as never);

    expect(onEvent).toHaveBeenCalledTimes(2);
  });
});
