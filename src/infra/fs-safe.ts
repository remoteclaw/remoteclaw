import type { Stats } from "node:fs";
import { constants as fsConstants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sameFileIdentity } from "./file-identity.js";
import { expandHomePrefix } from "./home-dir.js";
import {
  hasNodeErrorCode,
  isNotFoundPathError,
  isPathInside,
  isSymlinkOpenError,
} from "./path-guards.js";

export type SafeOpenErrorCode =
  | "invalid-path"
  | "not-found"
  | "outside-workspace"
  | "symlink"
  | "not-file"
  | "path-mismatch"
  | "too-large";

export class SafeOpenError extends Error {
  code: SafeOpenErrorCode;

  constructor(code: SafeOpenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "SafeOpenError";
  }
}

export type SafeOpenResult = {
  handle: FileHandle;
  realPath: string;
  stat: Stats;
};

export type SafeLocalReadResult = {
  buffer: Buffer;
  realPath: string;
  stat: Stats;
};

const SUPPORTS_NOFOLLOW = process.platform !== "win32" && "O_NOFOLLOW" in fsConstants;
const OPEN_READ_FLAGS = fsConstants.O_RDONLY | (SUPPORTS_NOFOLLOW ? fsConstants.O_NOFOLLOW : 0);

const ensureTrailingSep = (value: string) => (value.endsWith(path.sep) ? value : value + path.sep);

async function expandRelativePathWithHome(relativePath: string): Promise<string> {
  let home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  try {
    home = await fs.realpath(home);
  } catch {
    // If the home dir cannot be canonicalized, keep lexical expansion behavior.
  }
  return expandHomePrefix(relativePath, { home });
}

async function openVerifiedLocalFile(filePath: string): Promise<SafeOpenResult> {
  // Reject directories before opening so we never surface EISDIR to callers (e.g. tool
  // results that get sent to messaging channels). See upstream openclaw#31186.
  try {
    const preStat = await fs.lstat(filePath);
    if (preStat.isDirectory()) {
      throw new SafeOpenError("not-file", "not a file");
    }
  } catch (err) {
    if (err instanceof SafeOpenError) {
      throw err;
    }
    // ENOENT and other lstat errors: fall through and let fs.open handle.
  }

  let handle: FileHandle;
  try {
    handle = await fs.open(filePath, OPEN_READ_FLAGS);
  } catch (err) {
    if (isNotFoundPathError(err)) {
      throw new SafeOpenError("not-found", "file not found");
    }
    if (isSymlinkOpenError(err)) {
      throw new SafeOpenError("symlink", "symlink open blocked", { cause: err });
    }
    // Defensive: if open still throws EISDIR (e.g. race), sanitize so it never leaks.
    if (hasNodeErrorCode(err, "EISDIR")) {
      throw new SafeOpenError("not-file", "not a file");
    }
    throw err;
  }

  try {
    const [stat, lstat] = await Promise.all([handle.stat(), fs.lstat(filePath)]);
    if (lstat.isSymbolicLink()) {
      throw new SafeOpenError("symlink", "symlink not allowed");
    }
    if (!stat.isFile()) {
      throw new SafeOpenError("not-file", "not a file");
    }
    if (!sameFileIdentity(stat, lstat)) {
      throw new SafeOpenError("path-mismatch", "path changed during read");
    }

    const realPath = await fs.realpath(filePath);
    const realStat = await fs.stat(realPath);
    if (!sameFileIdentity(stat, realStat)) {
      throw new SafeOpenError("path-mismatch", "path mismatch");
    }

    return { handle, realPath, stat };
  } catch (err) {
    await handle.close().catch(() => {});
    if (err instanceof SafeOpenError) {
      throw err;
    }
    if (isNotFoundPathError(err)) {
      throw new SafeOpenError("not-found", "file not found");
    }
    throw err;
  }
}

async function resolvePathWithinRoot(params: {
  rootDir: string;
  relativePath: string;
}): Promise<{ rootReal: string; rootWithSep: string; resolved: string }> {
  let rootReal: string;
  try {
    rootReal = await fs.realpath(params.rootDir);
  } catch (err) {
    if (isNotFoundPathError(err)) {
      throw new SafeOpenError("not-found", "root dir not found");
    }
    throw err;
  }
  const rootWithSep = ensureTrailingSep(rootReal);
  const expanded = await expandRelativePathWithHome(params.relativePath);
  const resolved = path.resolve(rootWithSep, expanded);
  if (!isPathInside(rootWithSep, resolved)) {
    throw new SafeOpenError("outside-workspace", "file is outside workspace root");
  }
  return { rootReal, rootWithSep, resolved };
}

export async function openFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  rejectHardlinks?: boolean;
}): Promise<SafeOpenResult> {
  const { rootWithSep, resolved } = await resolvePathWithinRoot(params);

  let opened: SafeOpenResult;
  try {
    opened = await openVerifiedLocalFile(resolved);
  } catch (err) {
    if (err instanceof SafeOpenError) {
      if (err.code === "not-found") {
        throw err;
      }
      throw new SafeOpenError("invalid-path", "path is not a regular file under root", {
        cause: err,
      });
    }
    throw err;
  }

  if (!isPathInside(rootWithSep, opened.realPath)) {
    await opened.handle.close().catch(() => {});
    throw new SafeOpenError("outside-workspace", "file is outside workspace root");
  }

  return opened;
}

export async function readLocalFileSafely(params: {
  filePath: string;
  maxBytes?: number;
}): Promise<SafeLocalReadResult> {
  const opened = await openVerifiedLocalFile(params.filePath);
  try {
    if (params.maxBytes !== undefined && opened.stat.size > params.maxBytes) {
      throw new SafeOpenError(
        "too-large",
        `file exceeds limit of ${params.maxBytes} bytes (got ${opened.stat.size})`,
      );
    }
    const buffer = await opened.handle.readFile();
    return { buffer, realPath: opened.realPath, stat: opened.stat };
  } finally {
    await opened.handle.close().catch(() => {});
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function readOpenedFileSafely(params: {
  opened: SafeOpenResult;
  maxBytes?: number;
}): Promise<SafeLocalReadResult> {
  if (params.maxBytes !== undefined && params.opened.stat.size > params.maxBytes) {
    throw new SafeOpenError(
      "too-large",
      `file exceeds limit of ${params.maxBytes} bytes (got ${params.opened.stat.size})`,
    );
  }
  const buffer = await params.opened.handle.readFile();
  return {
    buffer,
    realPath: params.opened.realPath,
    stat: params.opened.stat,
  };
}

export type SafeWritableOpenResult = {
  handle: FileHandle;
  createdForWrite: boolean;
  openedRealPath: string;
};

export async function resolveOpenedFileRealPathForHandle(
  handle: FileHandle,
  ioPath: string,
): Promise<string> {
  try {
    return await fs.realpath(ioPath);
  } catch (err) {
    if (!isNotFoundPathError(err)) {
      throw err;
    }
  }

  const fdCandidates =
    process.platform === "linux"
      ? [`/proc/self/fd/${handle.fd}`, `/dev/fd/${handle.fd}`]
      : process.platform === "win32"
        ? []
        : [`/dev/fd/${handle.fd}`];
  for (const fdPath of fdCandidates) {
    try {
      return await fs.realpath(fdPath);
    } catch {
      // try next fd path
    }
  }
  throw new SafeOpenError("path-mismatch", "unable to resolve opened file path");
}

export async function openWritableFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  mkdir?: boolean;
  mode?: number;
}): Promise<SafeWritableOpenResult> {
  const { rootReal, rootWithSep, resolved } = await resolvePathWithinRoot(params);
  try {
    await assertNoPathAliasEscape({
      absolutePath: resolved,
      rootPath: rootReal,
      boundaryLabel: "root",
    });
  } catch (err) {
    throw new SafeOpenError("invalid-path", "path alias escape blocked", { cause: err });
  }
  if (params.mkdir !== false) {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
  }

  let ioPath = resolved;
  try {
    const resolvedRealPath = await fs.realpath(resolved);
    if (!isPathInside(rootWithSep, resolvedRealPath)) {
      throw new SafeOpenError("outside-workspace", "file is outside workspace root");
    }
    ioPath = resolvedRealPath;
  } catch (err) {
    if (err instanceof SafeOpenError) {
      throw err;
    }
    if (!isNotFoundPathError(err)) {
      throw err;
    }
  }

  const fileMode = params.mode ?? 0o600;

  let handle: FileHandle;
  let createdForWrite = false;
  try {
    try {
      handle = await fs.open(ioPath, OPEN_WRITE_EXISTING_FLAGS, fileMode);
    } catch (err) {
      if (!isNotFoundPathError(err)) {
        throw err;
      }
      handle = await fs.open(ioPath, OPEN_WRITE_CREATE_FLAGS, fileMode);
      createdForWrite = true;
    }
  } catch (err) {
    if (isNotFoundPathError(err)) {
      throw new SafeOpenError("not-found", "file not found");
    }
    if (isSymlinkOpenError(err)) {
      throw new SafeOpenError("invalid-path", "symlink open blocked", { cause: err });
    }
    throw err;
  }

  let openedRealPath: string | null = null;
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new SafeOpenError("invalid-path", "path is not a regular file under root");
    }
    if (stat.nlink > 1) {
      throw new SafeOpenError("invalid-path", "hardlinked path not allowed");
    }

    try {
      const lstat = await fs.lstat(ioPath);
      if (lstat.isSymbolicLink() || !lstat.isFile()) {
        throw new SafeOpenError("invalid-path", "path is not a regular file under root");
      }
      if (!sameFileIdentity(stat, lstat)) {
        throw new SafeOpenError("path-mismatch", "path changed during write");
      }
    } catch (err) {
      if (!isNotFoundPathError(err)) {
        throw err;
      }
    }

    const realPath = await resolveOpenedFileRealPathForHandle(handle, ioPath);
    openedRealPath = realPath;
    const realStat = await fs.stat(realPath);
    if (!sameFileIdentity(stat, realStat)) {
      throw new SafeOpenError("path-mismatch", "path mismatch");
    }
    if (realStat.nlink > 1) {
      throw new SafeOpenError("invalid-path", "hardlinked path not allowed");
    }
    if (!isPathInside(rootWithSep, realPath)) {
      throw new SafeOpenError("outside-workspace", "file is outside workspace root");
    }

    // Truncate only after boundary and identity checks complete. This avoids
    // irreversible side effects if a symlink target changes before validation.
    if (!createdForWrite) {
      await handle.truncate(0);
    }
    return {
      handle,
      createdForWrite,
      openedRealPath: realPath,
    };
  } catch (err) {
    const cleanupCreatedPath = createdForWrite && err instanceof SafeOpenError;
    const cleanupPath = openedRealPath ?? ioPath;
    await handle.close().catch(() => {});
    if (cleanupCreatedPath) {
      await fs.rm(cleanupPath, { force: true }).catch(() => {});
    }
    throw err;
  }
}

export async function writeFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  data: string | Buffer;
  encoding?: BufferEncoding;
  mkdir?: boolean;
}): Promise<void> {
  const target = await openWritableFileWithinRoot({
    rootDir: params.rootDir,
    relativePath: params.relativePath,
    mkdir: params.mkdir,
  });
  try {
    if (typeof params.data === "string") {
      await target.handle.writeFile(params.data, params.encoding ?? "utf8");
    } else {
      await target.handle.writeFile(params.data);
    }
  } finally {
    await target.handle.close().catch(() => {});
  }
}

export async function copyFileWithinRoot(params: {
  sourcePath: string;
  rootDir: string;
  relativePath: string;
  maxBytes?: number;
  mkdir?: boolean;
  rejectSourceHardlinks?: boolean;
}): Promise<void> {
  const source = await openVerifiedLocalFile(params.sourcePath, {
    rejectHardlinks: params.rejectSourceHardlinks,
  });
  if (params.maxBytes !== undefined && source.stat.size > params.maxBytes) {
    await source.handle.close().catch(() => {});
    throw new SafeOpenError(
      "too-large",
      `file exceeds limit of ${params.maxBytes} bytes (got ${source.stat.size})`,
    );
  }

  let target: {
    handle: FileHandle;
    createdForWrite: boolean;
    openedRealPath: string;
  } | null = null;
  let sourceClosedByStream = false;
  let targetClosedByStream = false;
  try {
    target = await openWritableFileWithinRoot({
      rootDir: params.rootDir,
      relativePath: params.relativePath,
      mkdir: params.mkdir,
    });
    const sourceStream = source.handle.createReadStream();
    const targetStream = target.handle.createWriteStream();
    sourceStream.once("close", () => {
      sourceClosedByStream = true;
    });
    targetStream.once("close", () => {
      targetClosedByStream = true;
    });
    await pipeline(sourceStream, targetStream);
  } catch (err) {
    if (target?.createdForWrite) {
      await fs.rm(target.openedRealPath, { force: true }).catch(() => {});
    }
    throw err;
  } finally {
    if (!sourceClosedByStream) {
      await source.handle.close().catch(() => {});
    }
    if (target && !targetClosedByStream) {
      await target.handle.close().catch(() => {});
    }
  }
}

export async function writeFileFromPathWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  sourcePath: string;
  mkdir?: boolean;
}): Promise<void> {
  await copyFileWithinRoot({
    sourcePath: params.sourcePath,
    rootDir: params.rootDir,
    relativePath: params.relativePath,
    mkdir: params.mkdir,
    rejectSourceHardlinks: true,
  });
}
