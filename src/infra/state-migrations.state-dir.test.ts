import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  autoMigrateLegacyStateDir,
  resetAutoMigrateLegacyStateDirForTest,
} from "./state-migrations.js";

let tempRoot: string | null = null;

async function makeTempRoot() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "remoteclaw-state-dir-"));
  tempRoot = root;
  return root;
}

afterEach(async () => {
  resetAutoMigrateLegacyStateDirForTest();
  if (!tempRoot) {
    return;
  }
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("legacy state dir auto-migration", () => {
  it("is a no-op stub (legacy migration gutted in fork)", async () => {
    const root = await makeTempRoot();
    const legacyDir = path.join(root, ".clawdbot");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "marker.txt"), "ok", "utf-8");

    const result = await autoMigrateLegacyStateDir({
      env: {} as NodeJS.ProcessEnv,
      homedir: () => root,
    });

    expect(result.migrated).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns empty result when REMOTECLAW_STATE_DIR is set", async () => {
    const root = await makeTempRoot();

    const result = await autoMigrateLegacyStateDir({
      env: { REMOTECLAW_STATE_DIR: path.join(root, "custom-state") } as NodeJS.ProcessEnv,
      homedir: () => root,
    });

    expect(result).toEqual({
      migrated: false,
      skipped: false,
      changes: [],
      warnings: [],
    });
  });

  it("returns same empty result on repeated calls", async () => {
    const root = await makeTempRoot();

    const first = await autoMigrateLegacyStateDir({
      env: {} as NodeJS.ProcessEnv,
      homedir: () => root,
    });
    const second = await autoMigrateLegacyStateDir({
      env: {} as NodeJS.ProcessEnv,
      homedir: () => root,
    });

    expect(first).toEqual(second);
    expect(first.migrated).toBe(false);
  });
});
