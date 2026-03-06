import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureAgentWorkspace } from "./workspace.js";

describe("ensureAgentWorkspace", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates workspace directory when given a valid dir", async () => {
    tmpDir = path.join(os.tmpdir(), `workspace-test-${Date.now()}`);
    const result = await ensureAgentWorkspace({ dir: tmpDir });
    expect(result.dir).toBe(tmpDir);
    const stat = await fs.stat(tmpDir);
    expect(stat.isDirectory()).toBe(true);
  });
});
