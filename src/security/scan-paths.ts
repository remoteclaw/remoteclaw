import fs from "node:fs";
import path from "node:path";

export function isPathInside(basePath: string, candidatePath: string): boolean {
  const base = path.resolve(basePath);
  const candidate = path.resolve(candidatePath);
  const rel = path.relative(base, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

function safeRealpathSync(filePath: string): string | null {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return null;
  }
}

export function isPathInsideWithRealpath(
  basePath: string,
  candidatePath: string,
  opts?: { requireRealpath?: boolean },
): boolean {
  if (!isPathInside(basePath, candidatePath)) {
    return false;
  }
  const baseReal = safeRealpathSync(basePath);
  const candidateReal = safeRealpathSync(candidatePath);
  if (!baseReal || !candidateReal) {
    return opts?.requireRealpath !== true;
  }
  if (!isPathInside(baseReal, candidateReal)) {
    return false;
  }
  // Hardlinks share the same inode but realpath cannot detect them.
  // When strict mode is requested, reject files with multiple hard links
  // because they may alias content outside the base directory.
  if (opts?.requireRealpath) {
    try {
      const stat = fs.statSync(candidatePath);
      if (stat.isFile() && stat.nlink > 1) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export function extensionUsesSkippedScannerPath(entry: string): boolean {
  const segments = entry.split(/[\\/]+/).filter(Boolean);
  return segments.some(
    (segment) =>
      segment === "node_modules" ||
      (segment.startsWith(".") && segment !== "." && segment !== ".."),
  );
}
