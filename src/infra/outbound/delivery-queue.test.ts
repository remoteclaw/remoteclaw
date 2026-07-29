import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import {
  annotateDeliveredBeforeFailure,
  annotatePlatformSendAttempted,
} from "./delivered-before-failure.js";
import {
  ackDelivery,
  clearDeliveryAttemptMarker,
  type DeliverFn,
  enqueueDelivery,
  failDelivery,
  failPartialDelivery,
  failUnknownDelivery,
  hasUnknownSendOutcome,
  InvalidQueueEntryIdError,
  loadPendingDeliveries,
  markDeliveryAttemptStarted,
  type QueuedDelivery,
  quarantineUnknownSend,
  recoverPendingDeliveries,
  type RecoverySummary,
  resolveNeedsReviewDir,
  withActiveDeliveryClaim,
} from "./delivery-queue.js";

const cfg: RemoteClawConfig = {};

function createLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

let stateDir: string;

beforeEach(async () => {
  // realpath: macOS tmpdir is a symlink, and the queue compares resolved paths.
  stateDir = await fs.promises.realpath(
    await fs.promises.mkdtemp(path.join(tmpdir(), "remoteclaw-delivery-queue-")),
  );
});

async function enqueueTestDelivery(): Promise<string> {
  return await enqueueDelivery(
    { channel: "whatsapp", to: "+1555", payloads: [{ text: "hello" }] },
    stateDir,
  );
}

/**
 * Enqueue with an explicit `enqueuedAt` and recipient. Recovery processes
 * oldest-first, and two entries enqueued in the same millisecond would sort
 * by readdir order — stamping the timestamp makes multi-entry tests
 * deterministic rather than filesystem-dependent.
 */
async function enqueueTestDeliveryAt(enqueuedAt: number, to: string): Promise<string> {
  const id = await enqueueDelivery(
    { channel: "whatsapp", to, payloads: [{ text: "hello" }] },
    stateDir,
  );
  const filePath = path.join(stateDir, "delivery-queue", `${id}.json`);
  const entry = JSON.parse(await fs.promises.readFile(filePath, "utf-8"));
  entry.enqueuedAt = enqueuedAt;
  await fs.promises.writeFile(filePath, JSON.stringify(entry, null, 2));
  return id;
}

/**
 * Drive one recovery pass. Defaults to a no-op deliverer and a fresh log so a
 * test that only cares about the queue's own bookkeeping states just that.
 */
async function runRecovery(
  deliver: DeliverFn = vi.fn<DeliverFn>(async () => undefined),
  log = createLog(),
): Promise<{ summary: RecoverySummary; deliver: DeliverFn; log: ReturnType<typeof createLog> }> {
  const summary = await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
  return { summary, deliver, log };
}

async function readEntry(id: string, dir?: string): Promise<QueuedDelivery> {
  const filePath = path.join(dir ?? path.join(stateDir, "delivery-queue"), `${id}.json`);
  return JSON.parse(await fs.promises.readFile(filePath, "utf-8"));
}

/**
 * Every path under the state directory, sorted. Asserting a refused entry
 * produced no file ANYWHERE is stronger than checking the one directory an
 * escape was expected to reach — a traversal that lands somewhere unanticipated
 * still shows up as a new path.
 */
async function listStateDirTree(): Promise<string[]> {
  return (await fs.promises.readdir(stateDir, { recursive: true })).toSorted();
}

describe("send-in-flight marker", () => {
  it("stamps recoveryState and platformSendStartedAt on the pending entry", async () => {
    const id = await enqueueTestDelivery();
    expect((await readEntry(id)).recoveryState).toBeUndefined();

    await markDeliveryAttemptStarted(id, stateDir);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBe("send_attempt_started");
    expect(entry.platformSendStartedAt).toBeGreaterThan(0);
    expect(hasUnknownSendOutcome(entry)).toBe(true);
  });

  it("is cleared by failDelivery, because an observed failure is a known outcome", async () => {
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);

    await failDelivery(id, "boom", stateDir);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBeUndefined();
    expect(entry.platformSendStartedAt).toBeUndefined();
    expect(entry.retryCount).toBe(1);
    expect(entry.lastError).toBe("boom");
    expect(hasUnknownSendOutcome(entry)).toBe(false);
  });

  it("does not quarantine a marked entry that then acks successfully", async () => {
    // The marker is set on EVERY send, so the common case is a marked entry that
    // completes normally. Acking must clear it outright — not leave it pending,
    // and not route it to needs-review, which would make routine traffic land in
    // the operator's reconciliation queue.
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);

    await ackDelivery(id, stateDir);

    expect(await loadPendingDeliveries(stateDir)).toEqual([]);
    expect(fs.existsSync(path.join(resolveNeedsReviewDir(stateDir), `${id}.json`))).toBe(false);

    const deliver = vi.fn<DeliverFn>(async () => undefined);
    const { summary } = await runRecovery(deliver);
    expect(deliver).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(0);
    expect(summary.awaitingReviewAtStart).toBe(0);
  });

  it("is KEPT by failPartialDelivery, because some payloads already landed", async () => {
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);

    await failPartialDelivery(id, "partial delivery failure (bestEffort)", stateDir);

    const entry = await readEntry(id);
    // Replaying the whole entry would re-send the payloads that arrived.
    expect(entry.recoveryState).toBe("unknown_after_send");
    expect(hasUnknownSendOutcome(entry)).toBe(true);
    expect(entry.retryCount).toBe(1);
  });

  it("quarantines a partially-delivered entry instead of replaying it", async () => {
    const id = await enqueueTestDelivery();
    await failPartialDelivery(id, "partial delivery failure (bestEffort)", stateDir);
    const deliver = vi.fn<DeliverFn>(async () => undefined);

    const { summary } = await runRecovery(deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(1);
    expect(fs.existsSync(path.join(resolveNeedsReviewDir(stateDir), `${id}.json`))).toBe(true);
  });

  it("is cleared by clearDeliveryAttemptMarker", async () => {
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);

    await clearDeliveryAttemptMarker(id, stateDir);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBeUndefined();
    expect(entry.platformSendStartedAt).toBeUndefined();
  });
});

describe("failUnknownDelivery (#3051)", () => {
  it("keeps the marker so the entry is quarantined, not replayed", async () => {
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);

    await failUnknownDelivery(id, "socket hang up", stateDir);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBe("unknown_after_send");
    expect(hasUnknownSendOutcome(entry)).toBe(true);
    expect(entry.retryCount).toBe(1);
    expect(entry.lastError).toBe("socket hang up");
  });

  it("leaves deliveredBeforeFailure unset — the count is unknowable, not zero", async () => {
    // Writing 0 would render to an operator as "confirmed nothing arrived",
    // which is exactly the claim this outcome cannot make.
    const id = await enqueueTestDelivery();

    await failUnknownDelivery(id, "socket hang up", stateDir);

    expect((await readEntry(id)).deliveredBeforeFailure).toBeUndefined();
  });

  it("is quarantined by recovery rather than re-sent", async () => {
    const id = await enqueueTestDelivery();
    await failUnknownDelivery(id, "socket hang up", stateDir);
    const deliver = vi.fn<DeliverFn>(async () => undefined);

    const { summary, log } = await runRecovery(deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(1);
    expect(fs.existsSync(path.join(resolveNeedsReviewDir(stateDir), `${id}.json`))).toBe(true);
    // No landed count was recorded, so the operator log must not imply one.
    // Assert the line exists before asserting what it omits — a `find` that
    // returns undefined would otherwise let a vanished log line read as a pass.
    const incident = log.warn.mock.calls
      .map(String)
      .find((line) => line.includes(id) && line.includes("undetermined send outcome"));
    expect(incident).toBeDefined();
    expect(incident).not.toContain("confirmed sent");
    expect(incident).not.toMatch(/\bdelivered\b/);
  });
});

describe("entry id shape guard (#3051)", () => {
  /** Write a raw entry file under an arbitrary filename, bypassing enqueue. */
  async function plantRawEntry(fileStem: string, entry: Record<string, unknown>): Promise<void> {
    const queueDir = path.join(stateDir, "delivery-queue");
    await fs.promises.mkdir(queueDir, { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(
      path.join(queueDir, `${fileStem}.json`),
      JSON.stringify(entry, null, 2),
    );
  }

  const plantedEntry = {
    id: "not-a-uuid",
    enqueuedAt: 1,
    retryCount: 0,
    channel: "whatsapp",
    to: "+1555",
    payloads: [{ text: "planted" }],
    recoveryState: "send_attempt_started",
  };

  it("refuses to load an entry whose id is not a queue id", async () => {
    await plantRawEntry("planted", plantedEntry);

    expect(await loadPendingDeliveries(stateDir)).toEqual([]);
  });

  it("never lets a traversing id reach outside the queue directory", async () => {
    // Staged so the escape is REACHABLE rather than merely malformed: the
    // planted id resolves to a real file one level above the queue directory,
    // so without the guard recovery re-reads it, rewrites it, and renames it —
    // a queue operation mutating an arbitrary file outside its own directory.
    //
    // Reaching this already requires write access to the state dir, a trusted
    // boundary, so it is defense in depth rather than a live exposure (#3051
    // item 4). The point is that a malformed id fails closed BEFORE
    // `needs-review/${id}.json` or any sibling path is built from it.
    const outsideFile = path.join(stateDir, "escape-target.json");
    await fs.promises.writeFile(
      outsideFile,
      JSON.stringify({ ...plantedEntry, id: "../escape-target" }, null, 2),
    );
    // The scan reads by FILENAME and takes the id from the JSON body, so a
    // well-named file can carry a traversing id.
    await plantRawEntry("00000000-0000-4000-8000-000000000000", {
      ...plantedEntry,
      id: "../escape-target",
    });

    const deliver = vi.fn<DeliverFn>(async () => undefined);
    const { summary } = await runRecovery(deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(0);
    expect(summary.quarantineFailed).toBe(0);
    // The file above the queue directory is untouched, and nothing was moved
    // into (or through) the quarantine directory on its behalf.
    expect(fs.existsSync(outsideFile)).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "delivery-queue", "escape-target.json"))).toBe(false);
    expect(fs.existsSync(resolveNeedsReviewDir(stateDir))).toBe(false);
  });

  it("skips one malformed entry without stalling recovery of the rest", async () => {
    // Fail-closed must stay contained: a single planted entry cannot be allowed
    // to become a denial of service on every other pending delivery.
    await plantRawEntry("planted", plantedEntry);
    const good = await enqueueTestDelivery();
    const deliver = vi.fn<DeliverFn>(async () => undefined);

    const { summary } = await runRecovery(deliver);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(summary.recovered).toBe(1);
    expect(fs.existsSync(path.join(stateDir, "delivery-queue", `${good}.json`))).toBe(false);
  });

  it("reports the refused entry instead of dropping it silently", async () => {
    // A rejected entry is never retried, never quarantined and never counted, so
    // without a report the operator's only evidence is a .json that never leaves
    // delivery-queue/. An unobservable fail-closed guard is indistinguishable
    // from no guard at all.
    await plantRawEntry("planted", plantedEntry);
    const log = createLog();

    await runRecovery(
      vi.fn<DeliverFn>(async () => undefined),
      log,
    );

    const reported = log.error.mock.calls.map(String).find((line) => line.includes("planted.json"));
    expect(reported).toContain("will NOT be delivered or retried");
    expect(reported).toContain("malformed id");
  });

  it("rejects a mutation of an entry whose id is malformed", async () => {
    // updateQueueEntry is reached with the CALLER's id, so a well-formed
    // filename can still hold a malformed id. Every mutation parses through the
    // same guard, so quarantine/fail/mark all fail closed rather than persisting
    // an id that a later path build would trust.
    await plantRawEntry("planted", plantedEntry);

    await expect(markDeliveryAttemptStarted("planted", stateDir)).rejects.toThrow(
      InvalidQueueEntryIdError,
    );
    await expect(quarantineUnknownSend("planted", stateDir)).rejects.toThrow(
      InvalidQueueEntryIdError,
    );
  });

  it("accepts the ids enqueueDelivery actually mints", async () => {
    // Guards against a pattern so strict it rejects real traffic.
    const id = await enqueueTestDelivery();

    const pending = await loadPendingDeliveries(stateDir);

    expect(pending.map((entry) => entry.id)).toEqual([id]);
  });

  // #3061 item 3: the guard's only job is to keep an attacker-chosen string out
  // of a path build, so the payloads it must refuse are worth naming one by one.
  // "not-a-uuid" above is refused by almost any pattern; these are the ones a
  // silently-loosened pattern lets through — a dropped anchor, an added `m`
  // flag, a character class widened to include `/` or `.` — each with the suite
  // still green and the failure mode a queue operation writing outside its own
  // directory.
  const traversalIds: readonly { label: string; id: string }[] = [
    { label: "a relative traversal", id: "../../etc/passwd" },
    { label: "an absolute path", id: "/etc/passwd" },
    { label: "a bare parent reference", id: ".." },
    { label: "an embedded separator", id: "00000000-0000-4000-8000-000000000000/x" },
    // `$` in JS matches only the true end of input — unlike flavours where it
    // also matches before a trailing newline. Pinned so adding an `m` flag (or
    // porting the pattern) cannot reintroduce that escape unnoticed.
    { label: "a trailing newline", id: "00000000-0000-4000-8000-000000000000\n" },
    { label: "a NUL byte", id: "00000000-0000-4000-8000-000000000000\u0000.json" },
  ];

  it.each(traversalIds)("refuses $label as an entry id", async ({ id }) => {
    // Read through the scan rather than the guard directly: this is the path an
    // on-disk id actually travels, and it is where a caller would otherwise pick
    // the value up and hand it to `${dir}/${id}.json`.
    await plantRawEntry("00000000-0000-4000-8000-000000000000", { ...plantedEntry, id });
    const skipped: unknown[] = [];

    const pending = await loadPendingDeliveries(stateDir, (_file, err) => skipped.push(err));

    expect(pending).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toBeInstanceOf(InvalidQueueEntryIdError);
  });

  it("accepts a canonical uuid, in either case", async () => {
    // The complement of the table above: a shape check, not a version check, so
    // every RFC 4122 layout is equally acceptable and the pattern is
    // case-insensitive. Without this, "reject everything" would pass the table.
    for (const id of [
      "0b6d4f6e-6b7a-4f0e-9c2a-1d3e5f7a9b1c",
      "AABBCCDD-1122-4EEF-8899-001122334455",
      // A v1 layout, to pin "shape check, not version check".
      "00000000-0000-1000-8000-000000000000",
    ]) {
      await plantRawEntry(id, { ...plantedEntry, id });
    }

    const pending = await loadPendingDeliveries(stateDir);

    expect(pending).toHaveLength(3);
  });

  it("builds no path from any refused id, in the queue directory or outside it", async () => {
    // The property that matters is not "it threw" but "nothing was created or
    // moved on its behalf" — no `needs-review/${id}.json`, no `failed/${id}.json`,
    // no sibling anywhere. Compare the whole state directory before and after a
    // full recovery pass: an escape that lands somewhere unanticipated still
    // shows up as a new path.
    for (const [index, { id }] of traversalIds.entries()) {
      await plantRawEntry(`0000000${index}-0000-4000-8000-000000000000`, {
        ...plantedEntry,
        id,
      });
    }
    const before = await listStateDirTree();

    const deliver = vi.fn<DeliverFn>(async () => undefined);
    const { summary } = await runRecovery(deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(0);
    expect(summary.quarantineFailed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(fs.existsSync(resolveNeedsReviewDir(stateDir))).toBe(false);
    expect(await listStateDirTree()).toEqual(before);
  });
});

describe("quarantineUnknownSend", () => {
  it("moves the entry to needs-review/ stamped unknown_after_send", async () => {
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);

    await quarantineUnknownSend(id, stateDir);

    expect(await loadPendingDeliveries(stateDir)).toEqual([]);
    const quarantined = await readEntry(id, resolveNeedsReviewDir(stateDir));
    expect(quarantined.recoveryState).toBe("unknown_after_send");
    expect(quarantined.payloads).toEqual([{ text: "hello" }]);
  });
});

describe("withActiveDeliveryClaim", () => {
  it("returns the wrapped value to the owner", async () => {
    const result = await withActiveDeliveryClaim("entry-1", async () => "done");
    expect(result).toEqual({ status: "claimed", value: "done" });
  });

  it("denies a second concurrent claim on the same entry", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = withActiveDeliveryClaim("entry-1", async () => {
      await held;
      return "first";
    });
    const second = await withActiveDeliveryClaim("entry-1", async () => "second");

    expect(second).toEqual({ status: "claimed-by-other-owner" });
    release?.();
    expect(await first).toEqual({ status: "claimed", value: "first" });
  });

  it("does not block a concurrent claim on a different entry", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withActiveDeliveryClaim("entry-1", async () => {
      await held;
      return "first";
    });

    expect(await withActiveDeliveryClaim("entry-2", async () => "second")).toEqual({
      status: "claimed",
      value: "second",
    });

    release?.();
    await first;
  });

  it("releases the claim after the callback throws", async () => {
    await expect(
      withActiveDeliveryClaim("entry-1", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await withActiveDeliveryClaim("entry-1", async () => "reclaimed")).toEqual({
      status: "claimed",
      value: "reclaimed",
    });
  });
});

describe("recoverPendingDeliveries", () => {
  it("refuses to replay an entry whose send outcome is unknown", async () => {
    // The crash window: the process died between the platform send and the ack.
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);
    const deliver = vi.fn<DeliverFn>(async () => undefined);
    const log = createLog();

    const { summary } = await runRecovery(deliver, log);

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(1);
    expect(summary.recovered).toBe(0);
    expect(await loadPendingDeliveries(stateDir)).toEqual([]);
    expect((await readEntry(id, resolveNeedsReviewDir(stateDir))).recoveryState).toBe(
      "unknown_after_send",
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("may or may not have reached the recipient"),
    );
    // The operator log must name where the entry went and when the send began.
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(resolveNeedsReviewDir(stateDir)));
  });

  it("refuses replay even when the unknown entry is otherwise retry-eligible", async () => {
    // retryCount 0 + no lastAttemptAt is the "first replay after crash" fast path
    // that bypasses backoff — duplicate suppression must still win.
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);
    expect((await readEntry(id)).retryCount).toBe(0);
    const deliver = vi.fn<DeliverFn>(async () => undefined);

    const { summary } = await runRecovery(deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(1);
  });

  it("still replays a clean pending entry and acks it", async () => {
    const id = await enqueueTestDelivery();
    const deliver = vi.fn<DeliverFn>(async () => undefined);

    const { summary } = await runRecovery(deliver);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({
      channel: "whatsapp",
      to: "+1555",
      skipQueue: true,
    });
    expect(summary).toMatchObject({ recovered: 1, needsReview: 0, failed: 0 });
    expect(await loadPendingDeliveries(stateDir)).toEqual([]);
    expect(fs.existsSync(path.join(resolveNeedsReviewDir(stateDir), `${id}.json`))).toBe(false);
  });

  it("replays a mid-retry entry written before the marker existed", async () => {
    // Backward compatibility on the shape that actually differs: a pre-upgrade
    // gateway that had already retried. A clean pre-upgrade entry is
    // byte-identical to a clean current one (the new fields are optional), so
    // only a mid-retry entry distinguishes this from the clean-replay case.
    const id = "11111111-2222-3333-4444-555555555555";
    const queueDir = path.join(stateDir, "delivery-queue");
    await fs.promises.mkdir(queueDir, { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(
      path.join(queueDir, `${id}.json`),
      JSON.stringify(
        {
          id,
          enqueuedAt: Date.now() - 3_600_000,
          channel: "whatsapp",
          to: "+1555",
          payloads: [{ text: "legacy" }],
          retryCount: 3,
          lastAttemptAt: Date.now() - 600_000, // past the 2m backoff for retry 3
          lastError: "boom",
        },
        null,
        2,
      ),
    );
    const deliver = vi.fn<DeliverFn>(async () => undefined);

    const { summary } = await runRecovery(deliver);

    // Replayed as before, not swept into needs-review on first upgrade.
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(summary.recovered).toBe(1);
    expect(summary.needsReview).toBe(0);
  });

  it("skips an entry another owner removed after the scan", async () => {
    // Guards the vanished-entry path specifically: the file is gone by the time
    // the claim is granted, so there is nothing left to send.
    await enqueueTestDeliveryAt(1_000, "+FIRST");
    const gone = await enqueueTestDeliveryAt(2_000, "+GONE");
    const deliver = vi.fn<DeliverFn>(async () => {
      // A concurrent owner completes `gone` while recovery is busy with FIRST.
      await ackDelivery(gone, stateDir);
      return undefined;
    });

    const { summary } = await runRecovery(deliver);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "+FIRST" });
    expect(summary.recovered).toBe(1);
    expect(await loadPendingDeliveries(stateDir)).toEqual([]);
  });

  it("honours a retry/backoff state another owner wrote after the scan", async () => {
    // The entry still EXISTS, so no vanished-entry guard can save this one —
    // only re-reading it under the claim does. The stale snapshot says
    // "retryCount 0, never attempted" (immediately eligible); disk says
    // "attempted just now" (25s of backoff left).
    await enqueueTestDeliveryAt(1_000, "+FIRST");
    const retried = await enqueueTestDeliveryAt(2_000, "+RETRIED");
    const deliver = vi.fn<DeliverFn>(async () => {
      await failDelivery(retried, "network blip", stateDir);
      return undefined;
    });

    const { summary } = await runRecovery(deliver);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "+FIRST" });
    expect(summary.recovered).toBe(1);
    expect(summary.deferredBackoff).toBe(1);
  });

  it("re-reads the entry under the claim so a marker set after the scan still wins", async () => {
    // The marker can land between the scan and the claim (another owner entered
    // its send path). The stale snapshot says "clean"; disk says "in flight".
    await enqueueTestDeliveryAt(1_000, "+FIRST");
    const marked = await enqueueTestDeliveryAt(2_000, "+MARKED");
    const deliver = vi.fn<DeliverFn>(async () => {
      await markDeliveryAttemptStarted(marked, stateDir);
      return undefined;
    });

    const { summary } = await runRecovery(deliver);

    // FIRST was delivered; MARKED was quarantined off disk state, not replayed.
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "+FIRST" });
    expect(summary.recovered).toBe(1);
    expect(summary.needsReview).toBe(1);
    expect((await readEntry(marked, resolveNeedsReviewDir(stateDir))).recoveryState).toBe(
      "unknown_after_send",
    );
  });

  it("counts a failed quarantine separately and leaves the entry unsent", async () => {
    const id = await enqueueTestDelivery();
    await markDeliveryAttemptStarted(id, stateDir);
    // Block the move by occupying the target path with a non-directory.
    await fs.promises.writeFile(resolveNeedsReviewDir(stateDir), "not a directory");
    const deliver = vi.fn<DeliverFn>(async () => undefined);
    const log = createLog();

    const { summary } = await runRecovery(deliver, log);

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.quarantineFailed).toBe(1);
    // Not counted as handled — the entry is still pending and still unsent.
    expect(summary.needsReview).toBe(0);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("will NOT be replayed"));
    expect(await loadPendingDeliveries(stateDir)).toHaveLength(1);
  });

  it("marks its own replay in flight before delivering", async () => {
    // Recovery re-opens the same crash window it exists to close; without this
    // marker a crash mid-recovery would blind-replay on the next restart.
    const id = await enqueueTestDelivery();
    let stateDuringSend: string | undefined;
    const deliver = vi.fn<DeliverFn>(async () => {
      stateDuringSend = (await readEntry(id)).recoveryState;
      return undefined;
    });

    await runRecovery(deliver);

    expect(stateDuringSend).toBe("send_attempt_started");
  });

  it("clears the marker on an observed failure so the entry stays replayable", async () => {
    const id = await enqueueTestDelivery();
    const failing = vi.fn<DeliverFn>(async () => {
      throw new Error("network blip");
    });

    const { summary } = await runRecovery(failing);

    expect(summary.failed).toBe(1);
    const entry = await readEntry(id);
    expect(entry.recoveryState).toBeUndefined();
    expect(entry.retryCount).toBe(1);
    expect(hasUnknownSendOutcome(entry)).toBe(false);
  });

  it("does not double-deliver when two recovery passes race the same entry", async () => {
    await enqueueTestDelivery();
    let release: (() => void) | undefined;
    const inSend = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      held = resolve;
    });
    const slowDeliver = vi.fn<DeliverFn>(async () => {
      release?.();
      await blocked;
      return undefined;
    });
    // Separate mock so a broken claim guard fails this assertion instead of
    // deadlocking on the first pass's still-open send.
    const racingDeliver = vi.fn<DeliverFn>(async () => undefined);

    const first = runRecovery(slowDeliver);
    await inSend;
    const { summary: secondSummary } = await runRecovery(racingDeliver);

    // The claim, not the marker, is what tells recovery this entry is live:
    // without it the racing pass would quarantine a send still in flight.
    expect(racingDeliver).not.toHaveBeenCalled();
    expect(secondSummary.skippedClaimed).toBe(1);
    expect(secondSummary.needsReview).toBe(0);

    held?.();
    expect((await first).summary.recovered).toBe(1);
    expect(slowDeliver).toHaveBeenCalledTimes(1);
  });

  it("does not clear the marker when its own retry failed after some payloads landed", async () => {
    // Recovery's retry has the same partial-send window as the live path. If it
    // clears the marker regardless, the next restart replays the whole entry and
    // re-sends whatever already arrived — the duplicate, one restart later.
    const id = await enqueueTestDelivery();
    const partiallyFailing = vi.fn<DeliverFn>(async () => {
      throw annotateDeliveredBeforeFailure(new Error("chunk 2 exploded"), 1);
    });

    const { summary } = await runRecovery(partiallyFailing);

    expect(summary.failed).toBe(1);
    const entry = await readEntry(id);
    expect(entry.recoveryState).toBe("unknown_after_send");
    expect(entry.deliveredBeforeFailure).toBe(1);
    expect(hasUnknownSendOutcome(entry)).toBe(true);
  });

  it("quarantines rather than replays an entry its own retry partly delivered", async () => {
    const id = await enqueueTestDelivery();
    const partiallyFailing = vi.fn<DeliverFn>(async () => {
      throw annotateDeliveredBeforeFailure(new Error("chunk 2 exploded"), 1);
    });
    await runRecovery(partiallyFailing);

    const replay = vi.fn<DeliverFn>(async () => undefined);
    const { summary } = await runRecovery(replay);

    expect(replay).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(1);
    expect((await readEntry(id, resolveNeedsReviewDir(stateDir))).deliveredBeforeFailure).toBe(1);
  });

  it("still replays whole when the retry failed with nothing landed", async () => {
    // The mirror of the case above — an unreported or zero landed count must not
    // over-quarantine, or every transient failure becomes manual work.
    const id = await enqueueTestDelivery();
    const totallyFailing = vi.fn<DeliverFn>(async () => {
      throw annotateDeliveredBeforeFailure(new Error("connection refused"), 0);
    });

    await runRecovery(totallyFailing);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBeUndefined();
    expect(hasUnknownSendOutcome(entry)).toBe(false);
  });

  // #3061: recovery's own re-send has the same ambiguous-failure window as the
  // live path, and before this it resolved it the opposite way — the live send
  // quarantined the failure, recovery cleared the marker and replayed it on the
  // next restart. These four pin the symmetry: same classifier, same three arms,
  // so only the genuinely undetermined subset is quarantined.
  it("quarantines a re-send that failed ambiguously after reaching the transport (#3061)", async () => {
    // The bug this closes: a send was attempted, nothing was OBSERVED to land,
    // and the transport failed post-transmission. That is "we cannot tell", not
    // "nothing arrived" — replaying it is how the recipient gets it twice.
    const id = await enqueueTestDelivery();
    const ambiguous = vi.fn<DeliverFn>(async () => {
      throw annotatePlatformSendAttempted(
        annotateDeliveredBeforeFailure(
          Object.assign(new Error("socket hang up"), { code: "ETIMEDOUT" }),
          0,
        ),
        true,
      );
    });

    const { summary } = await runRecovery(ambiguous);

    expect(summary.failed).toBe(1);
    const entry = await readEntry(id);
    expect(entry.recoveryState).toBe("unknown_after_send");
    expect(hasUnknownSendOutcome(entry)).toBe(true);
    // Unknowable, not zero: `0` reads to an operator as "confirmed nothing
    // arrived", which is exactly what this outcome cannot confirm.
    expect(entry.deliveredBeforeFailure).toBeUndefined();
  });

  it("does not replay an ambiguously-failed re-send on the next startup (#3061)", async () => {
    // The disposition only matters if it survives the restart. Quarantine has to
    // take the entry out of the pending scan, not just stamp it.
    const id = await enqueueTestDelivery();
    await runRecovery(
      vi.fn<DeliverFn>(async () => {
        throw annotatePlatformSendAttempted(
          annotateDeliveredBeforeFailure(new Error("socket hang up"), 0),
          true,
        );
      }),
    );

    const replay = vi.fn<DeliverFn>(async () => undefined);
    const { summary } = await runRecovery(replay);

    expect(replay).not.toHaveBeenCalled();
    expect(summary.needsReview).toBe(1);
    expect(fs.existsSync(path.join(resolveNeedsReviewDir(stateDir), `${id}.json`))).toBe(true);
  });

  it("still replays a re-send that failed before reaching the transport (#3061)", async () => {
    // The blanket-quarantine mistake, guarded: a deterministic pre-send throw
    // (payload normalization, a hook, handler construction) definitely did not
    // land, so it must stay on the retry path exactly as the live send treats it.
    // Quarantining it would put routine validation errors into the operator's
    // manual queue and stop them ever being sent.
    const id = await enqueueTestDelivery();
    const preSend = vi.fn<DeliverFn>(async () => {
      throw annotatePlatformSendAttempted(
        annotateDeliveredBeforeFailure(new Error("no text fallback is available"), 0),
        false,
      );
    });

    const { summary } = await runRecovery(preSend);

    expect(summary.failed).toBe(1);
    const entry = await readEntry(id);
    expect(entry.recoveryState).toBeUndefined();
    expect(hasUnknownSendOutcome(entry)).toBe(false);
    expect(entry.retryCount).toBe(1);
  });

  it("still replays a re-send whose connection was never established (#3061)", async () => {
    // A send WAS attempted, so the flag alone would quarantine this — the errno
    // arm of `didSendDefinitelyNotLand` is what keeps routine transient outages
    // out of the reconciliation queue. Recovery re-runs the whole predicate, not
    // just the new flag.
    const id = await enqueueTestDelivery();
    const refused = vi.fn<DeliverFn>(async () => {
      throw annotatePlatformSendAttempted(
        annotateDeliveredBeforeFailure(
          Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
            code: "ECONNREFUSED",
          }),
          0,
        ),
        true,
      );
    });

    await runRecovery(refused);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBeUndefined();
    expect(hasUnknownSendOutcome(entry)).toBe(false);
  });

  it("keeps the partial-delivery disposition ahead of the ambiguity check (#3061)", async () => {
    // Both properties hold at once here (a send was attempted AND part of it
    // landed), and the landed count has to win: it is the more specific record,
    // and it is the only thing that tells the operator which parts arrived.
    const id = await enqueueTestDelivery();
    const partial = vi.fn<DeliverFn>(async () => {
      throw annotatePlatformSendAttempted(
        annotateDeliveredBeforeFailure(new Error("socket hang up"), 1),
        true,
      );
    });

    await runRecovery(partial);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBe("unknown_after_send");
    expect(entry.deliveredBeforeFailure).toBe(1);
  });

  it("keeps a permanent rejection on failed/ even though a send was attempted (#3061)", async () => {
    // The third arm. "chat not found" is the platform saying it did NOT accept
    // the message — a guaranteed non-delivery, not an ambiguity. Routing it to
    // needs-review would bury a known outcome among the undetermined ones.
    const id = await enqueueTestDelivery();
    const permanent = vi.fn<DeliverFn>(async () => {
      throw annotatePlatformSendAttempted(
        annotateDeliveredBeforeFailure(new Error("Bad Request: chat not found"), 0),
        true,
      );
    });

    const { summary } = await runRecovery(permanent);

    expect(summary.failed).toBe(1);
    expect(fs.existsSync(path.join(stateDir, "delivery-queue", "failed", `${id}.json`))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "delivery-queue", `${id}.json`))).toBe(false);
  });

  it("treats an unannotated failure as replay-whole (#3061)", async () => {
    // A DeliverFn that is not the outbound sender cannot report the flag, and
    // guessing "attempted" on its behalf would quarantine every failure it ever
    // raises. Unreported keeps the historical behaviour — the same default the
    // landed count takes.
    const id = await enqueueTestDelivery();
    const unannotated = vi.fn<DeliverFn>(async () => {
      throw new Error("socket hang up");
    });

    await runRecovery(unannotated);

    const entry = await readEntry(id);
    expect(entry.recoveryState).toBeUndefined();
    expect(hasUnknownSendOutcome(entry)).toBe(false);
    expect(entry.retryCount).toBe(1);
  });

  it("does not ack a bestEffort retry whose payloads all failed", async () => {
    // bestEffort swallows per-payload errors and resolves, so "did not throw" is
    // not "arrived". Acking here silently drops the message.
    const id = await enqueueTestDelivery();
    const swallowing = vi.fn<DeliverFn>(async (params) => {
      params.onError?.(new Error("rate limited"), params.payloads[0]);
      return [];
    });

    const { summary } = await runRecovery(swallowing);

    expect(summary.recovered).toBe(0);
    expect(summary.failed).toBe(1);
    const entry = await readEntry(id);
    expect(entry.retryCount).toBe(1);
    expect(entry.lastError).toContain("rate limited");
    // Nothing landed, so it stays replayable rather than becoming manual work.
    expect(hasUnknownSendOutcome(entry)).toBe(false);
  });

  it("quarantines a bestEffort retry where some payloads landed and others failed", async () => {
    const id = await enqueueTestDelivery();
    const partial = vi.fn<DeliverFn>(async (params) => {
      params.onError?.(new Error("rate limited"), params.payloads[0]);
      return [{ messageId: "m1" }];
    });

    const { summary } = await runRecovery(partial);

    expect(summary.recovered).toBe(0);
    const entry = await readEntry(id);
    expect(entry.recoveryState).toBe("unknown_after_send");
    expect(entry.deliveredBeforeFailure).toBe(1);
  });

  it("quarantines a partly-delivered entry even when the error is permanent", async () => {
    // "Permanent" answers whether retrying can work, not whether part of the
    // message is already on the recipient's device. Filing it under failed/
    // would tell the operator it never arrived.
    const id = await enqueueTestDelivery();
    const permanentMidSend = vi.fn<DeliverFn>(async () => {
      throw annotateDeliveredBeforeFailure(new Error("chat not found"), 1);
    });

    const { summary } = await runRecovery(permanentMidSend);

    expect(summary.failed).toBe(1);
    const entry = await readEntry(id);
    expect(entry.recoveryState).toBe("unknown_after_send");
    expect(fs.existsSync(path.join(stateDir, "delivery-queue", "failed", `${id}.json`))).toBe(
      false,
    );
  });

  it("reports quarantined mail on every later startup, not just the one that quarantined it", async () => {
    // Quarantining moves the entry out of the pending scan, so without a
    // standing count the only startup that ever mentions it is the one that
    // created it. After a log rotation the operator has no way to discover that
    // mail is waiting for them.
    const id = await enqueueTestDelivery();
    await failPartialDelivery(id, "boom", stateDir, 1);
    const deliver = vi.fn<DeliverFn>(async () => undefined);
    await runRecovery(deliver);

    // Second startup: nothing pending at all, one entry still awaiting review.
    const log = createLog();
    const { summary } = await runRecovery(deliver, log);

    expect(await loadPendingDeliveries(stateDir)).toEqual([]);
    expect(summary.needsReview).toBe(0);
    expect(summary.awaitingReviewAtStart).toBe(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("awaiting manual reconciliation"),
    );
  });

  it("counts message parts without a payload-count denominator", async () => {
    // `deliveredBeforeFailure` counts PLATFORM SENDS (one text payload chunks
    // into several), so rendering it as a fraction of payloads.length produced
    // impossible operator lines like "2 of 1 payload(s)".
    const id = await enqueueTestDelivery();
    await failPartialDelivery(id, "boom", stateDir, 2);
    const log = createLog();

    await runRecovery(
      vi.fn<DeliverFn>(async () => undefined),
      log,
    );

    // The incident record, not the remediation one that follows it.
    const incident = log.warn.mock.calls
      .map(String)
      .find((line) => line.includes(id) && line.includes("undetermined send outcome"));
    expect(incident).toContain("2 message part(s) confirmed sent");
    expect(incident).not.toContain("of 1");
  });

  it("does not claim the send was 'interrupted' — a live ambiguous failure was not", async () => {
    // The original wording was written for the process-crash case (#2934). A
    // live-path quarantine (#3051) is the opposite shape: the send ran to
    // completion and the platform's answer never came back. "Interrupted
    // mid-send" sends an operator hunting for a crash that never happened.
    const id = await enqueueTestDelivery();
    await failUnknownDelivery(id, "socket hang up", stateDir);
    const log = createLog();

    await runRecovery(
      vi.fn<DeliverFn>(async () => undefined),
      log,
    );

    const incident = log.warn.mock.calls
      .map(String)
      .find((line) => line.includes(id) && line.includes("undetermined send outcome"));
    expect(incident).toBeDefined();
    expect(incident).not.toContain("interrupted mid-send");
    expect(incident).toContain("may or may not have reached the recipient");
  });

  it("tells the operator to reset retryCount when un-quarantining a maxed-out entry", async () => {
    // failPartialDelivery increments retryCount, so an entry that accumulated
    // transient failures and then partly landed is quarantined AT the cap.
    // Following instructions that omit the reset files it to failed/ unsent.
    const id = await enqueueTestDelivery();
    for (let i = 0; i < 5; i += 1) {
      await failDelivery(id, "transient", stateDir);
    }
    await failPartialDelivery(id, "boom", stateDir, 1);
    const log = createLog();

    await runRecovery(
      vi.fn<DeliverFn>(async () => undefined),
      log,
    );

    const remediation = log.warn.mock.calls
      .map(String)
      .find((line) => line.includes(id) && line.includes("To reconcile"));
    expect(remediation).toContain('"retryCount" to 0');
    expect(remediation).toContain(`leaving it at 6 (max 5) files the entry under failed/`);
  });

  it("does not claim failed/ for an entry nowhere near the retry cap", async () => {
    // A live ambiguous send failure quarantines at retryCount 1, where the
    // unconditional "leaving retryCount at N files it under failed/ without
    // sending" is simply false. A runbook an operator catches lying is a runbook
    // they stop following.
    const id = await enqueueTestDelivery();
    await failUnknownDelivery(id, "socket hang up", stateDir);
    const log = createLog();

    await runRecovery(
      vi.fn<DeliverFn>(async () => undefined),
      log,
    );

    const remediation = log.warn.mock.calls
      .map(String)
      .find((line) => line.includes(id) && line.includes("To reconcile"));
    expect(remediation).toContain('"retryCount" to 0');
    expect(remediation).not.toContain("files the entry under failed/");
    expect(remediation).toContain("4 attempt(s) left");
  });

  it("still routes a permanent error with nothing landed to failed/", async () => {
    const id = await enqueueTestDelivery();
    const permanent = vi.fn<DeliverFn>(async () => {
      throw new Error("chat not found");
    });

    const { summary } = await runRecovery(permanent);

    expect(summary.failed).toBe(1);
    expect(fs.existsSync(path.join(stateDir, "delivery-queue", "failed", `${id}.json`))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "delivery-queue", `${id}.json`))).toBe(false);
  });
});
