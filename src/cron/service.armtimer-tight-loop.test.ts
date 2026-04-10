import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNoopLogger } from "./service.test-harness.js";
import { createCronServiceState } from "./service/state.js";
import { armTimer } from "./service/timer.js";

const noopLogger = createNoopLogger();

describe("CronService - armTimer tight loop prevention", () => {
  function extractTimeoutDelays(timeoutSpy: ReturnType<typeof vi.spyOn>) {
    const calls = timeoutSpy.mock.calls as Array<[unknown, unknown, ...unknown[]]>;
    return calls
      .map(([, delay]: [unknown, unknown, ...unknown[]]) => delay)
      .filter((d: unknown): d is number => typeof d === "number");
  }

  function createTimerState(params: {
    storePath: string;
    now: number;
    runIsolatedAgentJob?: () => Promise<{ status: "ok" }>;
  }) {
    return createCronServiceState({
      storePath: params.storePath,
      cronEnabled: true,
      log: noopLogger,
      nowMs: () => params.now,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob:
        params.runIsolatedAgentJob ?? vi.fn().mockResolvedValue({ status: "ok" }),
    });
  }

  beforeEach(() => {
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not add extra delay when the next wake time is in the future", () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const now = Date.parse("2026-02-28T12:32:00.000Z");

    const state = createTimerState({
      storePath: "/tmp/test-cron/jobs.json",
      now,
    });
    state.store = {
      version: 1,
      jobs: [
        {
          id: "future-job",
          name: "future-job",
          enabled: true,
          deleteAfterRun: false,
          createdAtMs: now,
          updatedAtMs: now,
          schedule: { kind: "cron", expr: "*/15 * * * *" },
          sessionTarget: "isolated" as const,
          wakeMode: "next-heartbeat" as const,
          payload: { kind: "agentTurn" as const, message: "test" },
          delivery: { mode: "none" as const },
          state: { nextRunAtMs: now + 10_000 }, // 10 seconds in the future
        },
      ],
    };

    armTimer(state);

    const delays = extractTimeoutDelays(timeoutSpy);

    // The natural delay (10 s) should be used, not the floor.
    expect(delays).toContain(10_000);

    timeoutSpy.mockRestore();
  });
});
