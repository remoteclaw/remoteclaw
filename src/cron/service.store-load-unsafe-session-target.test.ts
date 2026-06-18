import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCronServiceState } from "./service/state.js";
import { ensureLoaded } from "./service/store.js";

const UNSAFE_WARN =
  "cron: job has invalid persisted sessionTarget; run remoteclaw doctor --fix to repair";

function createNoopLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function unsafeJob(overrides: Record<string, unknown>) {
  return {
    enabled: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    schedule: { kind: "every", everyMs: 60_000 },
    wakeMode: "now",
    payload: { kind: "agentTurn", message: "hello" },
    state: {},
    ...overrides,
  };
}

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function writeStore(jobs: Array<Record<string, unknown>>) {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-cron-unsafe-load-"));
  const storePath = path.join(tempDir, "cron", "jobs.json");
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify({ version: 1, jobs }, null, 2), "utf-8");
  return storePath;
}

function makeState(storePath: string, log: ReturnType<typeof createNoopLogger>) {
  return createCronServiceState({
    storePath,
    cronEnabled: true,
    log,
    enqueueSystemEvent: vi.fn(),
    requestHeartbeatNow: vi.fn(),
    runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" as const })),
  });
}

function unsafeWarnCalls(log: ReturnType<typeof createNoopLogger>) {
  return log.warn.mock.calls.filter((call) => call[1] === UNSAFE_WARN);
}

describe("ensureLoaded unsafe persisted sessionTarget warning", () => {
  it("warns once per job id across repeated forceReload ticks", async () => {
    const log = createNoopLogger();
    const storePath = await writeStore([
      unsafeJob({
        id: "bad-session-job",
        name: "bad session job",
        sessionTarget: "session:../../outside",
      }),
    ]);
    const state = makeState(storePath, log);

    // onTimer reloads the store with forceReload on every tick; simulate three.
    for (let i = 0; i < 3; i++) {
      await ensureLoaded(state, { forceReload: true, skipRecompute: true });
    }

    const warns = unsafeWarnCalls(log);
    expect(warns).toHaveLength(1);
    expect(warns[0]?.[0]).toMatchObject({ jobId: "bad-session-job", storePath });
  });

  it("warns once per distinct unsafe job id", async () => {
    const log = createNoopLogger();
    const storePath = await writeStore([
      unsafeJob({ id: "bad-a", name: "a", sessionTarget: "session:../../a" }),
      unsafeJob({ id: "bad-b", name: "b", sessionTarget: "session:bad/b" }),
    ]);
    const state = makeState(storePath, log);

    await ensureLoaded(state, { forceReload: true, skipRecompute: true });
    await ensureLoaded(state, { forceReload: true, skipRecompute: true });

    const warns = unsafeWarnCalls(log);
    expect(warns).toHaveLength(2);
    // Deterministic: ensureLoaded iterates jobs in store order, so the first
    // load warns bad-a then bad-b; the second load warns neither.
    expect(warns.map((call) => (call[0] as { jobId?: string }).jobId)).toEqual(["bad-a", "bad-b"]);
  });
});
