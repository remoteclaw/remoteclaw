import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, createTempDirTracker, makeTempDir } from "./temp-dir.js";

const tempDirs = new Set<string>();

afterEach(() => {
  cleanupTempDirs(tempDirs);
});

describe("temp-dir test helpers", () => {
  it("keeps a non-executed temp warning fixture for CI proof", () => {
    // remoteclaw-temp-dir: allow test fixture for the temp warning report
    const warningFixture = 'tmp.dirSync({ prefix: "remoteclaw-warning-fixture-" })';

    expect(warningFixture).toContain("tmp.dirSync");
  });

  it("tracks created temp dirs and removes populated dirs", () => {
    const tracker = createTempDirTracker();
    const dir = tracker.make("remoteclaw-temp-dir-helper-");
    tempDirs.add(dir);
    fs.writeFileSync(path.join(dir, "artifact.txt"), "artifact\n", "utf8");

    tracker.cleanup();
    tempDirs.delete(dir);

    expect(fs.existsSync(dir)).toBe(false);
    expect([...tracker.dirs]).toEqual([]);
  });

  it("supports existing caller-owned temp dir collections", () => {
    const dir = makeTempDir(tempDirs, "remoteclaw-temp-dir-existing-");
    fs.mkdirSync(path.join(dir, "nested"), { recursive: true });

    cleanupTempDirs(tempDirs);

    expect(fs.existsSync(dir)).toBe(false);
    expect([...tempDirs]).toEqual([]);
  });
});
