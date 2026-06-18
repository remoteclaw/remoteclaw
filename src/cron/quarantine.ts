import fs from "node:fs/promises";
import path from "node:path";
import {
  assertSafeCronSessionTargetId,
  isInvalidCronSessionTargetIdError,
} from "./session-target.js";
import { loadCronStore, saveCronStore } from "./store.js";
import type { CronJob } from "./types.js";

/** Reason stamped onto every job moved into the quarantine file. */
export const CRON_QUARANTINE_REASON = "unsafe sessionTarget session id";

/**
 * Sibling file that holds cron jobs quarantined by `doctor --fix`. The scheduler
 * only ever loads the active store path, so a job moved here is fully out of the
 * execution path while staying available for manual inspection or recovery.
 */
export function resolveCronQuarantinePath(storePath: string): string {
  if (storePath.endsWith(".json")) {
    return storePath.replace(/\.json$/, ".quarantine.json");
  }
  return `${storePath}.quarantine.json`;
}

/**
 * Mirror of the loader's fail-closed gate (`assertSafeCronSessionTargetId`, used
 * by `cron/service/store.ts` on every reload): a persisted `session:<id>` target
 * whose id is empty or contains path separators / NULs is unsafe. Such a job
 * never runs, but it lingers in the active store and re-warns on every load
 * until quarantined.
 */
export function isUnsafePersistedCronSessionTarget(raw: Record<string, unknown>): boolean {
  const sessionTarget = raw.sessionTarget;
  if (typeof sessionTarget !== "string") {
    return false;
  }
  const trimmed = sessionTarget.trim();
  if (!trimmed.toLowerCase().startsWith("session:")) {
    return false;
  }
  try {
    assertSafeCronSessionTargetId(trimmed.slice("session:".length));
    return false;
  } catch (error) {
    if (isInvalidCronSessionTargetIdError(error)) {
      return true;
    }
    throw error;
  }
}

export async function readCronQuarantineJobs(
  quarantinePath: string,
): Promise<Array<Record<string, unknown>>> {
  let raw: string;
  try {
    raw = await fs.readFile(quarantinePath, "utf-8");
  } catch (err) {
    if ((err as { code?: unknown })?.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const jobs = (parsed as { jobs?: unknown })?.jobs;
    if (Array.isArray(jobs)) {
      return jobs as Array<Record<string, unknown>>;
    }
  } catch {
    // Best-effort forensic record: an unreadable quarantine file is replaced
    // rather than allowed to block quarantining the newly detected jobs.
  }
  return [];
}

async function appendCronQuarantineJobs(params: {
  quarantinePath: string;
  jobs: Array<Record<string, unknown>>;
  quarantinedAtMs: number;
}): Promise<void> {
  const existing = await readCronQuarantineJobs(params.quarantinePath);
  const entries = [
    ...existing,
    ...params.jobs.map((job) => ({
      ...job,
      quarantinedAtMs: params.quarantinedAtMs,
      quarantineReason: CRON_QUARANTINE_REASON,
    })),
  ];
  await fs.mkdir(path.dirname(params.quarantinePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(
    params.quarantinePath,
    `${JSON.stringify({ version: 1, jobs: entries }, null, 2)}\n`,
    { encoding: "utf-8", mode: 0o600 },
  );
  await fs.chmod(params.quarantinePath, 0o600).catch(() => undefined);
}

export type CronUnsafeJobScan = {
  quarantinePath: string;
  unsafe: Array<Record<string, unknown>>;
};

/** Read-only scan: which persisted jobs have an unsafe sessionTarget. */
export async function scanUnsafePersistedCronJobs(storePath: string): Promise<CronUnsafeJobScan> {
  const store = await loadCronStore(storePath);
  const rawJobs = (store.jobs ?? []) as unknown as Array<Record<string, unknown>>;
  return {
    quarantinePath: resolveCronQuarantinePath(storePath),
    unsafe: rawJobs.filter(isUnsafePersistedCronSessionTarget),
  };
}

export type CronQuarantineResult = {
  quarantinePath: string;
  quarantined: Array<Record<string, unknown>>;
  remaining: number;
};

/**
 * Move every unsafe persisted job out of the active store and into the
 * quarantine file. The active store is rewritten with only the safe jobs, so
 * quarantined jobs are removed from the scheduler's execution path. No-op (no
 * file written, store untouched) when there are no unsafe jobs.
 *
 * `quarantinedAtMs` is injected by the caller so this stays deterministic.
 */
export async function quarantineUnsafePersistedCronJobs(params: {
  storePath: string;
  quarantinedAtMs: number;
}): Promise<CronQuarantineResult> {
  const store = await loadCronStore(params.storePath);
  const rawJobs = (store.jobs ?? []) as unknown as Array<Record<string, unknown>>;
  const quarantinePath = resolveCronQuarantinePath(params.storePath);
  const unsafe = rawJobs.filter(isUnsafePersistedCronSessionTarget);
  if (unsafe.length === 0) {
    return { quarantinePath, quarantined: [], remaining: rawJobs.length };
  }
  const safe = rawJobs.filter((raw) => !isUnsafePersistedCronSessionTarget(raw));
  await appendCronQuarantineJobs({
    quarantinePath,
    jobs: unsafe,
    quarantinedAtMs: params.quarantinedAtMs,
  });
  await saveCronStore(params.storePath, {
    version: 1,
    jobs: safe as unknown as CronJob[],
  });
  return { quarantinePath, quarantined: unsafe, remaining: safe.length };
}
