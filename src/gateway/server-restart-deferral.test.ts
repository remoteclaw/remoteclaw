import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllDispatchers,
  getTotalPendingReplies,
} from "../auto-reply/reply/dispatcher-registry.js";
import { createReplyDispatcher } from "../auto-reply/reply/reply-dispatcher.js";

async function flushMicrotasks(count = 10): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

describe("gateway restart deferral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushMicrotasks();
    clearAllDispatchers();
  });

  it("clears dispatcher reservation when no replies were sent", async () => {
    let deliverCalled = false;
    const dispatcher = createReplyDispatcher({
      deliver: async () => {
        deliverCalled = true;
      },
    });

    expect(getTotalPendingReplies()).toBe(1);

    dispatcher.markComplete();
    await flushMicrotasks();

    expect(getTotalPendingReplies()).toBe(0);
    await dispatcher.waitForIdle();

    expect(deliverCalled).toBe(false);
    expect(getTotalPendingReplies()).toBe(0);
  });
});
