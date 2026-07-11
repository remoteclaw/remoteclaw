import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCronRunLogEntriesPage } from "./run-log.js";

describe("cron run log errorReason", () => {
  it("backfills errorReason from timeout error text for older entries", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-run-log-"));
    const file = path.join(dir, "job.jsonl");
    await fs.writeFile(
      file,
      `${JSON.stringify({
        ts: 1,
        jobId: "job-1",
        action: "finished",
        status: "error",
        error: "cron: job execution timed out",
      })}\n`,
      "utf8",
    );

    const page = await readCronRunLogEntriesPage(file, { limit: 10 });
    expect(page.entries[0]?.errorReason).toBe("timeout");
  });

  it("validates persisted errorReason against the full failover reason set", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-run-log-"));
    const file = path.join(dir, "job.jsonl");
    // RemoteClaw fork narrows FailoverReason (model-provider failover
    // ecosystem is being gutted): the accepted set is the seven below, not
    // upstream's wider taxonomy (auth_permanent/overloaded/server_error/etc.).
    // CRON_FAILOVER_REASONS in run-log.ts is the source of truth.
    const reasons = [
      "auth",
      "format",
      "rate_limit",
      "billing",
      "timeout",
      "model_not_found",
      "unknown",
    ];
    await fs.writeFile(
      file,
      reasons
        .map((errorReason, index) =>
          JSON.stringify({
            ts: index + 1,
            jobId: "job-1",
            action: "finished",
            status: "error",
            errorReason,
          }),
        )
        .join("\n") + "\n",
      "utf8",
    );

    const page = await readCronRunLogEntriesPage(file, { limit: 50, sortDir: "asc" });
    expect(page.entries.map((entry) => entry.errorReason)).toEqual(reasons);
  });

  it("derives an invalid persisted reason from raw error text before exposing entries", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-run-log-"));
    const file = path.join(dir, "job.jsonl");
    await fs.writeFile(
      file,
      `${JSON.stringify({
        ts: 1,
        jobId: "job-1",
        action: "finished",
        status: "error",
        error: "upstream unavailable: 503 overloaded",
        errorReason: "not-a-real-reason",
      })}\n`,
      "utf8",
    );

    const page = await readCronRunLogEntriesPage(file, { limit: 10 });
    // An invalid persisted reason is discarded and re-derived from the raw
    // error text. The fork's narrow taxonomy has no dedicated "overloaded"
    // reason, so 5xx/overload text folds into "rate_limit".
    expect(page.entries[0]?.errorReason).toBe("rate_limit");
  });

  it("derives persisted run-log reasons from raw error text (no provider context)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-run-log-"));
    const file = path.join(dir, "job.jsonl");
    await fs.writeFile(
      file,
      `${JSON.stringify({
        ts: 1,
        jobId: "job-1",
        action: "finished",
        status: "error",
        error: "403 Key limit exceeded (monthly limit)",
        provider: "openrouter",
      })}\n`,
      "utf8",
    );

    const page = await readCronRunLogEntriesPage(file, { limit: 10 });
    // The fork classifies from raw error text only (no provider-context
    // billing inference): a 403 key-limit error resolves to "auth".
    expect(page.entries[0]?.errorReason).toBe("auth");
  });

  it("includes derived errorReason values in run-log search", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-run-log-"));
    const file = path.join(dir, "job.jsonl");
    await fs.writeFile(
      file,
      `${JSON.stringify({
        ts: 1,
        jobId: "job-1",
        action: "finished",
        status: "error",
        error: "cron: job execution timed out",
      })}\n`,
      "utf8",
    );

    const page = await readCronRunLogEntriesPage(file, { limit: 10, query: "timeout" });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.errorReason).toBe("timeout");
  });
});
