// Moves a path to the user's trash directory without spawning a helper binary.
//
// This exists alongside `infra/trash.ts` (the browser-profile mover — same
// export name, still shells out to a PATH-resolved `trash`). Resolving `trash`
// through %PATH% lets whatever comes first on the path run in our process
// context — the untrusted-search-path class this fork already closed for
// Windows system binaries — so the onboarding reset path uses this module.
//
// `allowedRoots` is the CALLER's assertion of where the target is expected to
// live, checked against the fully-resolved target. It is not a defence against
// a local attacker: there is an unavoidable window between the check and the
// rename (no `renameat` binding).

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isPathInside } from "./path-guards.js";
import { generateSecureToken } from "./secure-random.js";

export type MovePathToTrashOptions = {
  /**
   * Directories the fully-resolved target must live under. An empty or omitted
   * list disables the check. Supplying roots derived from the target itself
   * makes the check trivially true — pass independently-known roots for it to
   * mean anything.
   */
  allowedRoots?: string[];
};

/** Best-effort canonicalization: paths that do not exist resolve lexically. */
async function realpathOrResolve(candidate: string): Promise<string> {
  try {
    return await fs.realpath(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function resolveTrashDir(): string {
  // Linux desktops read ~/.local/share/Trash. No companion `info/*.trashinfo`
  // is written, so entries land in the right place but cannot be restored from
  // a desktop trash UI — same as `infra/trash.ts`'s fallback. Elsewhere
  // (darwin, win32) use ~/.Trash, matching that module's convention rather than
  // inventing a second one.
  if (process.platform === "linux") {
    const dataHome = process.env.XDG_DATA_HOME?.trim();
    const base =
      dataHome && path.isAbsolute(dataHome) ? dataHome : path.join(os.homedir(), ".local", "share");
    return path.join(base, "Trash", "files");
  }
  return path.join(os.homedir(), ".Trash");
}

async function assertWithinAllowedRoots(target: string, allowedRoots: string[]) {
  // Compare canonical forms on both sides: a root given as a symlink and a
  // target reached through one must agree.
  const resolvedTarget = await realpathOrResolve(target);
  const roots = await Promise.all(allowedRoots.map(realpathOrResolve));
  if (roots.some((root) => isPathInside(root, resolvedTarget))) {
    return;
  }
  throw new Error(`refusing to trash a path outside the allowed roots: ${resolvedTarget}`);
}

/** Move `targetPath` into the trash directory, returning its new location. */
export async function movePathToTrash(
  targetPath: string,
  options?: MovePathToTrashOptions,
): Promise<string> {
  const absoluteTarget = path.resolve(targetPath);
  // Canonicalize the parent but keep the basename as written, so the rename
  // moves the entry itself even when it is a symlink.
  const source = path.join(
    await realpathOrResolve(path.dirname(absoluteTarget)),
    path.basename(absoluteTarget),
  );

  const allowedRoots = options?.allowedRoots ?? [];
  if (allowedRoots.length > 0) {
    await assertWithinAllowedRoots(source, allowedRoots);
  }

  const trashDir = resolveTrashDir();
  await fs.mkdir(trashDir, { recursive: true });
  // Always disambiguate. `fs.rename` silently replaces an existing file, so
  // testing for a collision first and only then adding entropy would let two
  // items trashed in the same millisecond destroy each other.
  const destination = path.join(
    trashDir,
    `${path.basename(source)}-${Date.now()}-${generateSecureToken(6)}`,
  );

  try {
    await fs.rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    // The trash directory is on a different filesystem than the target (state
    // on an external drive, a separate /data partition, a container volume).
    // rename(2) cannot cross that boundary, so copy and unlink instead.
    await fs.cp(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    });
    await fs.rm(source, { recursive: true, force: true });
  }
  return destination;
}
