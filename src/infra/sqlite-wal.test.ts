// Covers SQLite WAL maintenance configuration.
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  DEFAULT_SQLITE_WAL_AUTOCHECKPOINT_PAGES,
  configureSqliteWalMaintenance,
} from "./sqlite-wal.js";

function createMockDb(): { db: DatabaseSync; exec: Mock } {
  const exec = vi.fn();
  return { db: { exec } as unknown as DatabaseSync, exec };
}

describe("sqlite WAL maintenance", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enables WAL mode and explicit autocheckpointing", () => {
    const { db, exec } = createMockDb();

    configureSqliteWalMaintenance(db, { checkpointIntervalMs: 0 });

    expect(exec).toHaveBeenNthCalledWith(1, "PRAGMA journal_mode = WAL;");
    expect(exec).toHaveBeenNthCalledWith(
      2,
      `PRAGMA wal_autocheckpoint = ${DEFAULT_SQLITE_WAL_AUTOCHECKPOINT_PAGES};`,
    );
  });

  it("runs periodic TRUNCATE checkpoints and stops them on close", () => {
    vi.useFakeTimers();
    const { db, exec } = createMockDb();

    const maintenance = configureSqliteWalMaintenance(db, { checkpointIntervalMs: 100 });
    expect(exec).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(100);
    expect(exec).toHaveBeenLastCalledWith("PRAGMA wal_checkpoint(TRUNCATE);");
    expect(exec).toHaveBeenCalledTimes(3);

    expect(maintenance.close()).toBe(true);
    expect(exec).toHaveBeenCalledTimes(4);

    vi.advanceTimersByTime(200);
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it("reports checkpoint errors without throwing from background maintenance", () => {
    const { db, exec } = createMockDb();
    const error = new Error("busy");
    const onCheckpointError = vi.fn();
    exec.mockImplementation((sql: string) => {
      if (sql.includes("wal_checkpoint")) {
        throw error;
      }
    });

    const maintenance = configureSqliteWalMaintenance(db, {
      checkpointIntervalMs: 0,
      onCheckpointError,
    });

    expect(maintenance.checkpoint()).toBe(false);
    expect(onCheckpointError).toHaveBeenCalledWith(error);
  });
});
