import type { DatabaseSync } from "node:sqlite";
// Tests for SQLite user_version pragma helper.
import { describe, expect, it } from "vitest";
import { readSqliteUserVersion } from "./sqlite-user-version.js";

// The helper only ever calls prepare().get(); the mocks implement that much.
const asDb = (mock: { prepare: () => { get: () => unknown } }) => mock as unknown as DatabaseSync;

describe("readSqliteUserVersion", () => {
  it("returns 0 when row is undefined", () => {
    const db = asDb({
      prepare: () => ({ get: () => undefined }),
    });
    expect(readSqliteUserVersion(db)).toBe(0);
  });

  it("returns 0 when user_version is null", () => {
    const db = asDb({
      prepare: () => ({ get: () => ({ user_version: null }) }),
    });
    expect(readSqliteUserVersion(db)).toBe(0);
  });

  it("returns numeric user_version", () => {
    const db = asDb({
      prepare: () => ({ get: () => ({ user_version: 5 }) }),
    });
    expect(readSqliteUserVersion(db)).toBe(5);
  });

  it("returns 0 when user_version is 0", () => {
    const db = asDb({
      prepare: () => ({ get: () => ({ user_version: 0 }) }),
    });
    expect(readSqliteUserVersion(db)).toBe(0);
  });

  it("converts string user_version to number", () => {
    const db = asDb({
      prepare: () => ({ get: () => ({ user_version: "3" }) }),
    });
    expect(readSqliteUserVersion(db)).toBe(3);
  });

  it("returns 0 for empty object", () => {
    const db = asDb({
      prepare: () => ({ get: () => ({}) }),
    });
    expect(readSqliteUserVersion(db)).toBe(0);
  });
});
