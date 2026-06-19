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

describe("maybeRepairLegacyCronStore", () => {
  it("repairs legacy cron store fields and migrates notify fallback to webhook delivery", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [createLegacyCronJob()]);

    const noteSpy = noteMock;
    const cfg = createCronConfig(storePath);

    await maybeRepairLegacyCronStore({
      cfg,
      options: {},
      prompter: makePrompter(true),
    });

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    const [job] = persisted.jobs;
    expect(job?.jobId).toBeUndefined();
    expect(job?.id).toBe("legacy-job");
    expect(job?.notify).toBeUndefined();
    expect(job?.schedule).toMatchObject({
      kind: "cron",
      expr: "0 7 * * *",
      tz: "UTC",
    });
    expect(job?.delivery).toMatchObject({
      mode: "webhook",
      to: "https://example.invalid/cron-finished",
    });
    expect(job?.payload).toMatchObject({
      kind: "systemEvent",
      text: "Morning brief",
    });

    expect(noteSpy).toHaveBeenCalledWith(
      expect.stringContaining("Legacy cron job storage detected"),
      "Cron",
    );
    expect(noteSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cron store normalized"),
      "Doctor changes",
    );
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

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(persisted.jobs[0]?.id).toBe("42");
    expect(typeof persisted.jobs[1]?.id).toBe("string");
    expect(String(persisted.jobs[1]?.id)).toMatch(/^cron-/);
    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining("stores `id` as a non-string value"),
      "Cron",
    );
    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining("missing a canonical string `id`"),
      "Cron",
    );
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

    const noteSpy = noteMock;

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

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(persisted.jobs[0]?.notify).toBe(true);
    expect(noteSpy).toHaveBeenCalledWith(
      expect.stringContaining('uses legacy notify fallback alongside delivery mode "announce"'),
      "Doctor warnings",
    );
  });

  it("does not auto-repair in non-interactive mode without explicit repair approval", async () => {
    const storePath = await makeTempStorePath();
    await writeCronStore(storePath, [createLegacyCronJob()]);

    const noteSpy = noteMock;
    const prompter = makePrompter(false);

    await maybeRepairLegacyCronStore({
      cfg: createCronConfig(storePath),
      options: { nonInteractive: true },
      prompter,
    });

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(prompter.confirm).toHaveBeenCalledWith({
      message: "Repair legacy cron jobs now?",
      initialValue: true,
    });
    expect(persisted.jobs[0]?.jobId).toBe("legacy-job");
    expect(persisted.jobs[0]?.notify).toBe(true);
    expect(noteSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Cron store normalized"),
      "Doctor changes",
    );
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

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(persisted.jobs[0]?.notify).toBeUndefined();
    expect(persisted.jobs[0]?.delivery).toMatchObject({
      mode: "webhook",
      to: "https://example.invalid/cron-finished",
    });
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

    const persisted = JSON.parse(await fs.readFile(storePath, "utf-8")) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(persisted.jobs[0]?.channel).toBeUndefined();
    expect(persisted.jobs[0]?.to).toBeUndefined();
    expect(persisted.jobs[0]?.threadId).toBeUndefined();
    expect(persisted.jobs[0]?.delivery).toMatchObject({
      mode: "announce",
      channel: "telegram",
      to: "-1001234567890",
      threadId: "99",
    });
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
