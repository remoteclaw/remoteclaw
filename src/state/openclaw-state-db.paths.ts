// State database path helpers resolve shared RemoteClaw state DB paths.
import os from "node:os";
import path from "node:path";
import { isMainThread, threadId } from "node:worker_threads";
import { resolveStateDir } from "../config/paths.js";
import { parseStrictNonNegativeInteger } from "../infra/parse-finite-number.js";

/**
 * Path helpers for the shared RemoteClaw SQLite state database.
 *
 * Tests get worker-scoped temp state roots unless they explicitly provide
 * `REMOTECLAW_STATE_DIR`, which prevents parallel Vitest workers from sharing WAL files.
 */
function resolveRemoteClawStateRootDir(env: NodeJS.ProcessEnv): string {
  if (env.REMOTECLAW_STATE_DIR?.trim()) {
    return resolveStateDir(env);
  }
  if (env.VITEST || env.NODE_ENV === "test") {
    const workerId = parseStrictNonNegativeInteger(
      env.VITEST_WORKER_ID ?? env.VITEST_POOL_ID ?? "",
    );
    const shardSuffix =
      workerId !== undefined
        ? `${process.pid}-${workerId}`
        : isMainThread
          ? String(process.pid)
          : `${process.pid}-${threadId}`;
    return path.join(os.tmpdir(), "remoteclaw-test-state", shardSuffix);
  }
  return resolveStateDir(env);
}

/** Resolve the directory that contains the shared state SQLite file. */
export function resolveRemoteClawStateSqliteDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveRemoteClawStateRootDir(env), "state");
}

/** Resolve the shared state SQLite file path. */
export function resolveRemoteClawStateSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveRemoteClawStateSqliteDir(env), "remoteclaw.sqlite");
}
