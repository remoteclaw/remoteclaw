// Pins the removal of `src/infra/trash.ts` (#3102): a second `movePathToTrash`
// that spawned a PATH-resolved `trash` binary, reachable from the browser
// profile movers and from the `agents.delete` gateway RPC. Two failure modes are
// pinned here because they are separable — the spawn coming back, and the
// colliding export name coming back so a stray import silently picks it up.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCANNED_DIRS = ["src", "extensions"];
const SKIPPED_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

function listSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (/\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u.test(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  for (const dir of SCANNED_DIRS) {
    const absolute = path.join(repoRoot, dir);
    if (fs.existsSync(absolute)) {
      walk(absolute);
    }
  }
  return files;
}

describe("the PATH-spawning movePathToTrash twin", () => {
  it("no longer exists as a module", () => {
    expect(fs.existsSync(path.join(repoRoot, "src", "infra", "trash.ts"))).toBe(false);
  });

  it("leaves exactly one declaration of movePathToTrash", () => {
    const declaring = listSourceFiles()
      .filter((file) => /export\s+async\s+function\s+movePathToTrash\b/u.test(readSource(file)))
      .map((file) => path.relative(repoRoot, file));

    expect(declaring).toEqual(["src/infra/fs-safe-trash.ts"]);
  });

  it("has no caller spawning a trash binary off PATH", () => {
    // Matches `runExec("trash", …)` / `runCommandWithTimeout(["trash", …])` and
    // the bare-name forms that resolve through PATH rather than an absolute path.
    const spawnPattern =
      /(?:runExec|execFile|execFileAsync|spawn|spawnSync|execa)\s*\(\s*(['"`])trash\1|\[\s*(['"`])trash\2\s*,/u;
    const offenders = listSourceFiles()
      .filter((file) => !file.endsWith(path.join("infra", "trash.test.ts")))
      .filter((file) => spawnPattern.test(readSource(file)))
      .map((file) => path.relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });
});

function readSource(file: string): string {
  return fs.readFileSync(file, "utf8");
}
