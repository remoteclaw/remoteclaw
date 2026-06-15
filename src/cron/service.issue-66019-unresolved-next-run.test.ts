import { describe, expect, it, vi } from "vitest";
import {
  createDefaultIsolatedRunner,
  createIsolatedRegressionJob,
  noopLogger,
  setupCronRegressionFixtures,
  writeCronJobs,
} from "../../test/helpers/cron/service-regression-fixtures.js";
import * as schedule from "./schedule.js";
import { createCronServiceState } from "./service/state.js";
import { onTimer } from "./service/timer.js";

// Regression coverage for the upstream "unresolved next-run" cron fix (#66083),
// ported into the fork's consolidated cron service. When `computeNextRunAtMs`
// cannot resolve a cron job's next run, `applyJobResult` must NOT synthesize a
// phantom run time (the MIN_REFIRE_GAP_MS guard or the error backoff delay):
// a synthesized time looks "due" on the next tick and refires the job forever.
// Instead the schedule is cleared, and the existing maintenance recheck
// (`armTimer` + `recomputeNextRunsForMaintenance`) re-arms the job so it fires
// again once the next run becomes resolvable.
const issue66019Fixtures = setupCronRegressionFixtures({ prefix: "cron-66019-" });

function createIssue66019Job(params: { id: string; scheduledAt: number }) {
  return createIsolatedRegressionJob({
    id: params.id,
    name: params.id,
    scheduledAt: params.scheduledAt,
    schedule: { kind: "cron", expr: "0 7 * * *", tz: "Asia/Shanghai" },
    payload: { kind: "agentTurn", message: "ping" },
    state: { nextRunAtMs: params.scheduledAt - 1_000 },
  });
}

function createIssue66019State(params: {
  storePath: string;
  nowMs: () => number;
  runIsolatedAgentJob: Parameters<typeof createCronServiceState>[0]["runIsolatedAgentJob"];
}) {
  return createCronServiceState({
    cronEnabled: true,
    storePath: params.storePath,
    log: noopLogger,
    nowMs: params.nowMs,
    enqueueSystemEvent: vi.fn(),
    requestHeartbeatNow: vi.fn(),
    runIsolatedAgentJob: params.runIsolatedAgentJob,
  });
}

function clearCronTimer(state: ReturnType<typeof createCronServiceState>) {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

async function expectJobDoesNotRefireWhenNextRunIsUnresolved(params: {
  state: ReturnType<typeof createCronServiceState>;
  runIsolatedAgentJob: unknown;
  advanceNow: () => void;
}) {
  await onTimer(params.state);
  expect(params.runIsolatedAgentJob).toHaveBeenCalledTimes(1);
  expect(params.state.store?.jobs[0]?.state.nextRunAtMs).toBeUndefined();

  params.advanceNow();
  await onTimer(params.state);

  expect(params.runIsolatedAgentJob).toHaveBeenCalledTimes(1);
  expect(params.state.store?.jobs[0]?.state.nextRunAtMs).toBeUndefined();
}

describe("#66019 unresolved next-run repro", () => {
  it("does not refire a recurring cron job 2s later when next-run resolution returns undefined", async () => {
    const store = issue66019Fixtures.makeStorePath();
    const scheduledAt = Date.parse("2026-04-13T15:40:00.000Z");
    let now = scheduledAt;

    const cronJob = createIssue66019Job({
      id: "cron-66019-minimal-success",
      scheduledAt,
    });
    await writeCronJobs(store.storePath, [cronJob]);

    const runIsolatedAgentJob = createDefaultIsolatedRunner();
    const nextRunSpy = vi.spyOn(schedule, "computeNextRunAtMs").mockReturnValue(undefined);
    const state = createIssue66019State({
      storePath: store.storePath,
      nowMs: () => now,
      runIsolatedAgentJob,
    });

    try {
      // Before the fix, applyJobResult would synthesize endedAt + 2_000 here,
      // so a second tick a couple seconds later would refire the same job.
      await expectJobDoesNotRefireWhenNextRunIsUnresolved({
        state,
        runIsolatedAgentJob,
        advanceNow: () => {
          now = scheduledAt + 2_001;
        },
      });
    } finally {
      nextRunSpy.mockRestore();
      clearCronTimer(state);
    }
  });

  it("does not refire a recurring errored cron job after the first backoff window when next-run resolution returns undefined", async () => {
    const store = issue66019Fixtures.makeStorePath();
    const scheduledAt = Date.parse("2026-04-13T15:45:00.000Z");
    let now = scheduledAt;

    const cronJob = createIssue66019Job({
      id: "cron-66019-minimal-error",
      scheduledAt,
    });
    await writeCronJobs(store.storePath, [cronJob]);

    const runIsolatedAgentJob = vi.fn().mockResolvedValue({
      status: "error",
      error: "synthetic failure",
    });
    const nextRunSpy = vi.spyOn(schedule, "computeNextRunAtMs").mockReturnValue(undefined);
    const state = createIssue66019State({
      storePath: store.storePath,
      nowMs: () => now,
      runIsolatedAgentJob,
    });

    try {
      // Before the fix, the error branch would synthesize the first backoff
      // retry (30s), so the next tick after that window would rerun the job.
      await expectJobDoesNotRefireWhenNextRunIsUnresolved({
        state,
        runIsolatedAgentJob,
        advanceNow: () => {
          now = scheduledAt + 30_001;
        },
      });
    } finally {
      nextRunSpy.mockRestore();
      clearCronTimer(state);
    }
  });

  it("reschedules and fires on a later tick once the next run becomes resolvable", async () => {
    const store = issue66019Fixtures.makeStorePath();
    const scheduledAt = Date.parse("2026-04-13T15:50:00.000Z");
    let now = scheduledAt;

    const cronJob = createIssue66019Job({
      id: "cron-66019-recovers",
      scheduledAt,
    });
    await writeCronJobs(store.storePath, [cronJob]);

    const runIsolatedAgentJob = createDefaultIsolatedRunner();
    // The next run is unresolved until `resolvable` flips, then becomes a
    // concrete future time. A flag-based mock keeps the test robust to the
    // exact number of internal computeNextRunAtMs calls per tick. The
    // `0 7 * * *` expression has no stagger offset, so the resolved value maps
    // directly onto nextRunAtMs.
    let resolvable = false;
    const resolvedNext = scheduledAt + 60_000;
    const nextRunSpy = vi
      .spyOn(schedule, "computeNextRunAtMs")
      .mockImplementation(() => (resolvable ? resolvedNext : undefined));
    const state = createIssue66019State({
      storePath: store.storePath,
      nowMs: () => now,
      runIsolatedAgentJob,
    });

    try {
      // First tick: the job runs once, but its next run is unresolved, so the
      // schedule is cleared instead of synthesizing a phantom refire time.
      await onTimer(state);
      expect(runIsolatedAgentJob).toHaveBeenCalledTimes(1);
      expect(state.store?.jobs[0]?.state.nextRunAtMs).toBeUndefined();

      // The next run becomes resolvable. A maintenance tick repairs the missing
      // nextRunAtMs without firing the job (it is not due yet).
      resolvable = true;
      now = scheduledAt + 1;
      await onTimer(state);
      expect(runIsolatedAgentJob).toHaveBeenCalledTimes(1);
      expect(state.store?.jobs[0]?.state.nextRunAtMs).toBe(resolvedNext);

      // Once the repaired next run is due, the job fires again.
      now = resolvedNext + 1;
      await onTimer(state);
      expect(runIsolatedAgentJob).toHaveBeenCalledTimes(2);
    } finally {
      nextRunSpy.mockRestore();
      clearCronTimer(state);
    }
  });
});
