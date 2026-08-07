// Pins the removal of `src/infra/trash.ts` (#3102): a second `movePathToTrash`
// that spawned a PATH-resolved `trash` binary, reachable from the browser
// profile movers and from the `agents.delete` gateway RPC. Two failure modes are
// pinned here because they are separable — the spawn coming back, and the
// colliding export name coming back so a stray import silently picks it up.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCANNED_DIRS = ["src", "extensions"];
const SKIPPED_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

// `scripts/check-extension-package-tsc-boundary.mjs --mode=canary` writes this
// exact basename into every extension root and removes it again, concurrently
// with this lane (#3143). It is never a committed source file — `git ls-files`
// matches none — so ignoring it hides nothing a twin could be smuggled in.
const BOUNDARY_CANARY_BASENAME = "__rootdir_boundary_canary__.ts";

const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u;

/** True only for the transient canary, and only at the path the boundary script
 * actually writes it to: `extensions/<id>/__rootdir_boundary_canary__.ts`
 * (`resolveCanaryArtifactPaths`). The location half is load-bearing — skipping
 * the basename ANYWHERE would let a twin hide at
 * `src/…/__rootdir_boundary_canary__.ts`, a path nothing creates or cleans up,
 * which is precisely the blind spot this scan must not have. */
function isBoundaryCanaryArtifact(dir: string, basename: string): boolean {
  return basename === BOUNDARY_CANARY_BASENAME && path.basename(path.dirname(dir)) === "extensions";
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function defaultRoots(): string[] {
  return SCANNED_DIRS.map((dir) => path.join(repoRoot, dir));
}

function listSourceFiles(roots: string[] = defaultRoots()): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      // Only a directory that vanished after its parent listed it. Anything
      // else (EACCES, ENOTDIR, ...) is a real fault and must still surface.
      if (isEnoent(error)) {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (isBoundaryCanaryArtifact(dir, entry.name)) {
        continue;
      }
      if (SOURCE_FILE_PATTERN.test(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  for (const root of roots) {
    if (fs.existsSync(root)) {
      walk(root);
    }
  }
  return files;
}

/** Reads `file`, or returns null if it vanished between listing and read.
 * ENOENT only — every other read fault still throws, so a scan that cannot
 * actually read the tree fails loudly instead of quietly matching nothing. */
function readSourceIfPresent(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
}

function filesMatching(pattern: RegExp, files: string[]): string[] {
  return files.filter((file) => {
    const source = readSourceIfPresent(file);
    return source !== null && pattern.test(source);
  });
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-trash-walk-"));
}

// Assembled at runtime so THIS file's own source never contains the contiguous
// declaration the scan searches for. Writing it as a plain literal would make
// `trash.test.ts` match itself, and the tempting fix — excluding this file from
// the declaration scan — would carve out exactly the blind spot a twin could
// hide in. The fixture on disk is byte-identical either way.
const MOVE_PATH_TO_TRASH_DECLARATION = [
  "export",
  "async",
  "function",
  "movePathToTrash() {}\n",
].join(" ");

describe("the PATH-spawning movePathToTrash twin", () => {
  it("no longer exists as a module", () => {
    expect(fs.existsSync(path.join(repoRoot, "src", "infra", "trash.ts"))).toBe(false);
  });

  it("leaves exactly one declaration of movePathToTrash", () => {
    const declaring = filesMatching(
      /export\s+async\s+function\s+movePathToTrash\b/u,
      listSourceFiles(),
    ).map((file) => path.relative(repoRoot, file));

    expect(declaring).toEqual(["src/infra/fs-safe-trash.ts"]);
  });

  it("has no caller spawning a trash binary off PATH", () => {
    // Matches `runExec("trash", …)` / `runCommandWithTimeout(["trash", …])` and
    // the bare-name forms that resolve through PATH rather than an absolute path.
    const spawnPattern =
      /(?:runExec|execFile|execFileAsync|spawn|spawnSync|execa)\s*\(\s*(['"`])trash\1|\[\s*(['"`])trash\2\s*,/u;
    const offenders = filesMatching(
      spawnPattern,
      listSourceFiles().filter((file) => !file.endsWith(path.join("infra", "trash.test.ts"))),
    ).map((file) => path.relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });
});

// The assertion above that matters most — "no caller spawning a trash binary" —
// expects an EMPTY array, so a scan that silently read nothing would pass it.
// These pin the scan itself, the same way the discovery canary in
// `scripts/check-throwing-stub-callers.mjs` pins that gate's file walk (#3138).
describe("the source scan the twin pins depend on", () => {
  it("actually reaches both scanned roots", () => {
    const scanned = listSourceFiles().map((file) => path.relative(repoRoot, file));

    // Content-presence, not a proxy count: a truncated walk satisfies a count.
    expect(scanned).toContain(path.join("src", "infra", "fs-safe-trash.ts"));
    expect(scanned.some((file) => file.startsWith(`extensions${path.sep}`))).toBe(true);
    // Loose floor; the tree holds ~6.2k files, and this fork actively guts code.
    expect(scanned.length).toBeGreaterThan(1000);
  });

  it("ignores the extension boundary canary while it is on disk", () => {
    const root = makeTempDir();
    try {
      // The exact shape the boundary script writes: extensions/<id>/<canary>.
      const extensionRoot = path.join(root, "extensions", "some-extension");
      fs.mkdirSync(extensionRoot, { recursive: true });
      fs.writeFileSync(path.join(extensionRoot, "real.ts"), "export {};\n", "utf8");
      fs.writeFileSync(path.join(extensionRoot, BOUNDARY_CANARY_BASENAME), "export {};\n", "utf8");

      expect(listSourceFiles([root]).map((file) => path.basename(file))).toEqual(["real.ts"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("still scans that basename outside an extension root", () => {
    // The skip is scoped to `extensions/<id>/` because that is the only place
    // the boundary script writes it. A file with the same name anywhere else is
    // created and cleaned up by nothing, so skipping it by bare basename would
    // hand a twin a permanent hiding place under `src/`.
    const root = makeTempDir();
    try {
      const nested = path.join(root, "src", "infra");
      fs.mkdirSync(nested, { recursive: true });
      const impostor = path.join(nested, BOUNDARY_CANARY_BASENAME);
      fs.writeFileSync(impostor, MOVE_PATH_TO_TRASH_DECLARATION, "utf8");

      expect(listSourceFiles([root])).toEqual([impostor]);
      expect(
        filesMatching(/export\s+async\s+function\s+movePathToTrash\b/u, listSourceFiles([root])),
      ).toEqual([impostor]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips a file that vanishes between listing and read", () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, "kept.ts"), MOVE_PATH_TO_TRASH_DECLARATION, "utf8");
      fs.writeFileSync(path.join(dir, "vanishing.ts"), MOVE_PATH_TO_TRASH_DECLARATION, "utf8");
      const listed = listSourceFiles([dir]);
      expect(listed).toHaveLength(2);

      // Exactly where `cleanupCanaryArtifacts()` lands in CI (#3143).
      fs.rmSync(path.join(dir, "vanishing.ts"));

      expect(filesMatching(/export\s+async\s+function\s+movePathToTrash\b/u, listed)).toEqual([
        path.join(dir, "kept.ts"),
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still throws when a read fails for any reason other than ENOENT", () => {
    const dir = makeTempDir();
    try {
      // A directory read as a file yields EISDIR — a stand-in for any non-ENOENT
      // fault. Assert the CODE, not merely that something threw: a bare
      // `.toThrow()` would also pass on an ENOENT the tolerance failed to catch.
      let code: string | undefined;
      try {
        filesMatching(/anything/u, [dir]);
      } catch (error) {
        code = (error as NodeJS.ErrnoException).code;
      }
      expect(code).toBeDefined();
      expect(code).not.toBe("ENOENT");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still throws when the directory walk fails for any reason other than ENOENT", () => {
    // The read path above has a twin at `readdirSync`; both tolerate ENOENT, so
    // both need proof they still surface everything else. A plain file used as a
    // scan root yields ENOTDIR.
    const dir = makeTempDir();
    const notADirectory = path.join(dir, "regular-file.ts");
    try {
      fs.writeFileSync(notADirectory, "export {};\n", "utf8");

      let code: string | undefined;
      try {
        listSourceFiles([notADirectory]);
      } catch (error) {
        code = (error as NodeJS.ErrnoException).code;
      }
      expect(code).toBeDefined();
      expect(code).not.toBe("ENOENT");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
