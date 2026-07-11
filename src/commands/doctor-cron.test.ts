import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveCronQuarantinePath } from "../cron/quarantine.js";
import { maybeQuarantineUnsafeCronJobs, maybeRepairLegacyCronStore } from "./doctor-cron.js";

type TerminalNote = (message: string, title?: string) => void;

const noteMock = vi.hoisted(() => vi.fn<TerminalNote>());

vi.mock("../terminal/note.js", () => ({
  note: noteMock,
}));

let tempRoot: string | null = null;

async function makeTempStorePath() {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-doctor-cron-"));
  return path.join(tempRoot, "cron", "jobs.json");
}

afterEach(async () => {
  noteMock.mockClear();
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

function makePrompter(confirmResult = true) {
  return {
    confirm: vi.fn().mockResolvedValue(confirmResult),
  };
}

function createCronConfig(storePath: string): RemoteClawConfig {
  return {
    cron: {
      store: storePath,
      webhook: "https://example.invalid/cron-finished",
    },
  };
}

function createLegacyCronJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "legacy-job",
    name: "Legacy job",
    notify: true,
    createdAtMs: Date.parse("2026-02-01T00:00:00.000Z"),
    updatedAtMs: Date.parse("2026-02-02T00:00:00.000Z"),
    schedule: { kind: "cron", cron: "0 7 * * *", tz: "UTC" },
    payload: {
      kind: "systemEvent",
      text: "Morning brief",
    },
    state: {},
    ...overrides,
  };
}

async function writeCronStore(storePath: string, jobs: Array<Record<string, unknown>>) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(
    storePath,
    JSON.stringify(
      {
        version: 1,
        jobs,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

async function readPersistedJobs(storePath: string): Promise<Array<Record<string, unknown>>> {
  const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
    jobs: Array<Record<string, unknown>>;
  };
  return persisted.jobs;
}

function requirePersistedJob(jobs: Array<Record<string, unknown>>, index: number) {
  const job = jobs[index];
  if (!job) {
    throw new Error(`expected persisted cron job ${index}`);
  }
  return job;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected ${label}`);
  }
  return value as Record<string, unknown>;
}

function expectNoteContaining(message: string, title: string): void {
  expect(
    noteMock.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes(message) && call[1] === title,
    ),
  ).toBe(true);
}

function expectNoNoteContaining(message: string, title: string): void {
  expect(
    noteMock.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes(message) && call[1] === title,
    ),
  ).toBe(false);
}

describe("maybeRepairLegacyCronStore", () => {
  it("surfaces cron payload model overrides without rewriting current jobs", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [
      {
        id: "api-pinned",
        name: "API pinned",
        enabled: true,
        createdAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        updatedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        schedule: { kind: "cron", expr: "0 7 * * *", tz: "UTC" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: "Morning brief",
          model: "openai/gpt-5.4",
          thinking: "high",
        },
        state: {},
      },
      {
        id: "other-pinned",
        name: "Other pinned",
        enabled: true,
        createdAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        updatedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: "Morning brief",
          model: "anthropic/claude-sonnet-4-6",
        },
        state: {},
      },
      {
        id: "inherits-default",
        name: "Inherits default",
        enabled: true,
        createdAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        updatedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: "Morning brief",
        },
        state: {},
      },
    ]);
    const prompter = makePrompter(true);

    await maybeRepairLegacyCronStore({
      cfg: {
        cron: { store: storePath },
        agents: {
          defaults: {
            model: { primary: "openai/gpt-5.5", fallbacks: [] },
          },
        },
      },
      options: {},
      prompter,
    });

    expect(prompter.confirm).not.toHaveBeenCalled();
    expectNoteContaining("Cron model overrides detected", "Cron");
    expectNoteContaining("2 jobs set `payload.model`", "Cron");
    expectNoteContaining("Provider namespaces: anthropic=1, openai=1", "Cron");
    expectNoteContaining("2 jobs use a different model than `agents.defaults.model`", "Cron");

    const jobs = await readPersistedJobs(storePath);
    const job = requirePersistedJob(jobs, 0);
    const payload = requireRecord(job.payload, "cron payload");
    expect(payload.model).toBe("openai/gpt-5.4");
    expect(payload.thinking).toBe("high");
  });

  it("does not surface cron model override diagnostics when jobs inherit the default", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [
      {
        id: "inherits-default",
        name: "Inherits default",
        enabled: true,
        createdAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        updatedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: "Morning brief",
        },
        state: {},
      },
    ]);

    await maybeRepairLegacyCronStore({
      cfg: createCronConfig(storePath),
      options: {},
      prompter: makePrompter(true),
    });

    expectNoNoteContaining("Cron model overrides detected", "Cron");
  });

  it("counts alias model pins as default mismatches", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [
      {
        id: "alias-pinned",
        name: "Alias pinned",
        enabled: true,
        createdAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        updatedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        schedule: { kind: "cron", expr: "0 10 * * *", tz: "UTC" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: "Morning brief",
          model: "gpt",
        },
        state: {},
      },
    ]);

    await maybeRepairLegacyCronStore({
      cfg: {
        cron: { store: storePath },
        agents: {
          defaults: {
            model: { primary: "pi:opus", fallbacks: [] },
          },
        },
      },
      options: {},
      prompter: makePrompter(true),
    });

    expectNoteContaining("1 job set `payload.model`", "Cron");
    expectNoteContaining("Provider namespaces: bare/alias=1", "Cron");
    expectNoteContaining("1 job uses a different model than `agents.defaults.model`", "Cron");
    expectNoteContaining("Examples: alias-pinned -> gpt", "Cron");
  });

  it("repairs legacy cron store fields and migrates notify fallback to webhook delivery", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [createLegacyCronJob()]);

    const cfg = createCronConfig(storePath);

    await maybeRepairLegacyCronStore({
      cfg,
      options: {},
      prompter: makePrompter(true),
    });

    const jobs = await readPersistedJobs(storePath);
    const job = requirePersistedJob(jobs, 0);
    expect(job.jobId).toBeUndefined();
    expect(job.id).toBe("legacy-job");
    expect(job.notify).toBeUndefined();
    const schedule = requireRecord(job.schedule, "cron schedule");
    expect(schedule.kind).toBe("cron");
    expect(schedule.expr).toBe("0 7 * * *");
    expect(schedule.tz).toBe("UTC");
    const delivery = requireRecord(job.delivery, "cron delivery");
    expect(delivery.mode).toBe("webhook");
    expect(delivery.to).toBe("https://example.invalid/cron-finished");
    const payload = requireRecord(job.payload, "cron payload");
    expect(payload.kind).toBe("systemEvent");
    expect(payload.text).toBe("Morning brief");

    expectNoteContaining("Legacy cron job storage detected", "Cron");
    expectNoteContaining("Cron store normalized", "Doctor changes");
  });

  it("repairs malformed persisted cron ids before list rendering sees them", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [
      createLegacyCronJob({
        id: 42,
        jobId: undefined,
        notify: false,
      }),
      createLegacyCronJob({
        id: undefined,
        jobId: undefined,
        name: "Missing id",
        notify: false,
      }),
    ]);

    await maybeRepairLegacyCronStore({
      cfg: createCronConfig(storePath),
      options: {},
      prompter: makePrompter(true),
    });

    const jobs = await readPersistedJobs(storePath);
    const firstJob = requirePersistedJob(jobs, 0);
    const secondJob = requirePersistedJob(jobs, 1);
    expect(firstJob.id).toBe("42");
    expect(typeof secondJob.id).toBe("string");
    expect(String(secondJob.id)).toMatch(/^cron-/);
    expectNoteContaining("stores `id` as a non-string value", "Cron");
    expectNoteContaining("missing a canonical string `id`", "Cron");
  });

  it("warns instead of replacing announce delivery for notify fallback jobs", async () => {
    const storePath = await makeTempStorePath();
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(
      storePath,
      JSON.stringify(
        {
          version: 1,
          jobs: [
            {
              id: "notify-and-announce",
              name: "Notify and announce",
              notify: true,
              createdAtMs: Date.parse("2026-02-01T00:00:00.000Z"),
              updatedAtMs: Date.parse("2026-02-02T00:00:00.000Z"),
              schedule: { kind: "every", everyMs: 60_000 },
              sessionTarget: "isolated",
              wakeMode: "now",
              payload: { kind: "agentTurn", message: "Status" },
              delivery: { mode: "announce", channel: "telegram", to: "123" },
              state: {},
            },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );

    await maybeRepairLegacyCronStore({
      cfg: {
        cron: {
          store: storePath,
          webhook: "https://example.invalid/cron-finished",
        },
      },
      options: { nonInteractive: true },
      prompter: makePrompter(true),
    });

    const jobs = await readPersistedJobs(storePath);
    const job = requirePersistedJob(jobs, 0);
    expect(job.notify).toBe(true);
    expectNoteContaining(
      'uses legacy notify fallback alongside delivery mode "announce"',
      "Doctor warnings",
    );
  });

  it("does not auto-repair in non-interactive mode without explicit repair approval", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [createLegacyCronJob()]);

    const prompter = makePrompter(false);

    await maybeRepairLegacyCronStore({
      cfg: createCronConfig(storePath),
      options: { nonInteractive: true },
      prompter,
    });

    const jobs = await readPersistedJobs(storePath);
    const job = requirePersistedJob(jobs, 0);
    expect(prompter.confirm).toHaveBeenCalledWith({
      message: "Repair legacy cron jobs now?",
      initialValue: true,
    });
    expect(job.jobId).toBe("legacy-job");
    expect(job.notify).toBe(true);
    expectNoNoteContaining("Cron store normalized", "Doctor changes");
  });

  it("migrates notify fallback none delivery jobs to cron.webhook", async () => {
    const storePath = await makeTempStorePath();
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(
      storePath,
      JSON.stringify(
        {
          version: 1,
          jobs: [
            {
              id: "notify-none",
              name: "Notify none",
              notify: true,
              createdAtMs: Date.parse("2026-02-01T00:00:00.000Z"),
              updatedAtMs: Date.parse("2026-02-02T00:00:00.000Z"),
              schedule: { kind: "every", everyMs: 60_000 },
              payload: {
                kind: "systemEvent",
                text: "Status",
              },
              delivery: { mode: "none", to: "123456789" },
              state: {},
            },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );

    await maybeRepairLegacyCronStore({
      cfg: {
        cron: {
          store: storePath,
          webhook: "https://example.invalid/cron-finished",
        },
      },
      options: {},
      prompter: makePrompter(true),
    });

    const jobs = await readPersistedJobs(storePath);
    const job = requirePersistedJob(jobs, 0);
    expect(job.notify).toBeUndefined();
    const delivery = requireRecord(job.delivery, "cron delivery");
    expect(delivery.mode).toBe("webhook");
    expect(delivery.to).toBe("https://example.invalid/cron-finished");
  });

  it("repairs legacy root delivery threadId hints into delivery", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [
      {
        id: "legacy-thread-hint",
        name: "Legacy thread hint",
        enabled: true,
        createdAtMs: Date.parse("2026-02-01T00:00:00.000Z"),
        updatedAtMs: Date.parse("2026-02-02T00:00:00.000Z"),
        schedule: { kind: "cron", cron: "0 7 * * *", tz: "UTC" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: "Morning brief",
        },
        channel: " telegram ",
        to: "-1001234567890",
        threadId: " 99 ",
        state: {},
      },
    ]);

    await maybeRepairLegacyCronStore({
      cfg: createCronConfig(storePath),
      options: {},
      prompter: makePrompter(true),
    });

    const jobs = await readPersistedJobs(storePath);
    const job = requirePersistedJob(jobs, 0);
    expect(job.channel).toBeUndefined();
    expect(job.to).toBeUndefined();
    expect(job.threadId).toBeUndefined();
    const delivery = requireRecord(job.delivery, "cron delivery");
    expect(delivery.mode).toBe("announce");
    expect(delivery.channel).toBe("telegram");
    expect(delivery.to).toBe("-1001234567890");
    expect(delivery.threadId).toBe("99");
  });

  it("rewrites stale managed dreaming jobs to the isolated agentTurn shape", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [
      {
        id: "memory-dreaming",
        name: "Memory Dreaming Promotion",
        description:
          "[managed-by=memory-core.short-term-promotion] Promote weighted short-term recalls.",
        enabled: true,
        createdAtMs: Date.parse("2026-04-01T00:00:00.000Z"),
        updatedAtMs: Date.parse("2026-04-01T00:00:00.000Z"),
        schedule: { kind: "cron", expr: "0 3 * * *", tz: "UTC" },
        sessionTarget: "main",
        wakeMode: "now",
        payload: {
          kind: "systemEvent",
          text: "__remoteclaw_memory_core_short_term_promotion_dream__",
        },
        state: {},
      },
    ]);

    await maybeRepairLegacyCronStore({
      cfg: createCronConfig(storePath),
      options: {},
      prompter: makePrompter(true),
    });

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    const job = requirePersistedJob(persisted.jobs, 0);
    expect(job.sessionTarget).toBe("isolated");
    const payload = requireRecord(job.payload, "cron payload");
    expect(payload.kind).toBe("agentTurn");
    expect(payload.message).toBe("__remoteclaw_memory_core_short_term_promotion_dream__");
    expect(payload.lightContext).toBe(true);
    const delivery = requireRecord(job.delivery, "cron delivery");
    expect(delivery.mode).toBe("none");
    expectNoteContaining("managed dreaming job", "Cron");
    expectNoteContaining("Rewrote 1 managed dreaming job", "Doctor changes");
  });

  it("warns and continues when the cron job store cannot be read", async () => {
    const storePath = await makeTempStorePath();
    // Force loadCronStore to throw a non-ENOENT read error by placing a
    // directory where the cron job store file would be. This mirrors the
    // Docker-on-root permission failure reported in #86102 without depending
    // on the test runner's effective uid (root bypasses chmod gates).
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.mkdir(storePath);
    const prompter = makePrompter(true);

    await expect(
      maybeRepairLegacyCronStore({
        cfg: { cron: { store: storePath } },
        options: {},
        prompter,
      }),
    ).resolves.toBeUndefined();

    expect(prompter.confirm).not.toHaveBeenCalled();
    expectNoteContaining("Unable to read cron job store at", "Cron");
    expectNoteContaining("later health checks will continue", "Cron");
  });
});

function createUnsafeSessionJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "bad-session-job",
    name: "Bad session job",
    enabled: true,
    createdAtMs: Date.parse("2026-02-01T00:00:00.000Z"),
    updatedAtMs: Date.parse("2026-02-02T00:00:00.000Z"),
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "session:../../outside",
    wakeMode: "now",
    payload: { kind: "agentTurn", message: "hello" },
    state: {},
    ...overrides,
  };
}

function createSafeMainJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "safe-job",
    name: "Safe job",
    enabled: true,
    createdAtMs: Date.parse("2026-02-01T00:00:00.000Z"),
    updatedAtMs: Date.parse("2026-02-02T00:00:00.000Z"),
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "main",
    wakeMode: "now",
    payload: { kind: "systemEvent", text: "ok" },
    state: {},
    ...overrides,
  };
}

describe("maybeQuarantineUnsafeCronJobs", () => {
  it("quarantines unsafe persisted sessionTarget jobs and removes them from the active store", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [createSafeMainJob(), createUnsafeSessionJob()]);

    await maybeQuarantineUnsafeCronJobs({
      cfg: createCronConfig(storePath),
      options: {},
      prompter: makePrompter(true),
    });

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(persisted.jobs.map((job) => job.id)).toEqual(["safe-job"]);

    const quarantinePath = resolveCronQuarantinePath(storePath);
    const quarantined = JSON.parse(await fs.readFile(quarantinePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(quarantined.jobs).toHaveLength(1);
    expect(quarantined.jobs[0]).toMatchObject({
      id: "bad-session-job",
      sessionTarget: "session:../../outside",
      quarantineReason: "unsafe sessionTarget session id",
    });
    expect(typeof quarantined.jobs[0]?.quarantinedAtMs).toBe("number");

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining("Quarantined 1 unsafe cron job"),
      "Doctor changes",
    );
  });

  it("appends to an existing quarantine file across repeated runs", async () => {
    const storePath = await makeTempStorePath();
    const quarantinePath = resolveCronQuarantinePath(storePath);

    await writeCronStore(storePath, [
      createSafeMainJob(),
      createUnsafeSessionJob({ id: "bad-1", sessionTarget: "session:../../one" }),
    ]);
    await maybeQuarantineUnsafeCronJobs({
      cfg: createCronConfig(storePath),
      options: {},
      prompter: makePrompter(true),
    });

    await writeCronStore(storePath, [
      createSafeMainJob(),
      createUnsafeSessionJob({ id: "bad-2", sessionTarget: "session:two/bad" }),
    ]);
    await maybeQuarantineUnsafeCronJobs({
      cfg: createCronConfig(storePath),
      options: {},
      prompter: makePrompter(true),
    });

    const quarantined = JSON.parse(await fs.readFile(quarantinePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(quarantined.jobs.map((job) => job.id)).toEqual(["bad-1", "bad-2"]);
  });

  it("does nothing when there are no unsafe persisted jobs", async () => {
    const storePath = await makeTempStorePath();
    // A safe custom session id (no path separators) must NOT be quarantined.
    await writeCronStore(storePath, [
      createSafeMainJob({ id: "safe-custom", sessionTarget: "session:safe-id" }),
    ]);
    const prompter = makePrompter(true);

    await maybeQuarantineUnsafeCronJobs({
      cfg: createCronConfig(storePath),
      options: {},
      prompter,
    });

    expect(prompter.confirm).not.toHaveBeenCalled();
    await expect(fs.access(resolveCronQuarantinePath(storePath))).rejects.toThrow();
    expect(noteMock).not.toHaveBeenCalled();
  });

  it("leaves unsafe jobs in place when quarantine is declined", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [createUnsafeSessionJob()]);
    const prompter = makePrompter(false);

    await maybeQuarantineUnsafeCronJobs({
      cfg: createCronConfig(storePath),
      options: { nonInteractive: true },
      prompter,
    });

    expect(prompter.confirm).toHaveBeenCalledWith({
      message: "Quarantine 1 unsafe cron job now?",
      initialValue: true,
    });
    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(persisted.jobs.map((job) => job.id)).toEqual(["bad-session-job"]);
    await expect(fs.access(resolveCronQuarantinePath(storePath))).rejects.toThrow();
  });
});
