import os from "node:os";
import path from "node:path";
import { isMainThread, threadId } from "node:worker_threads";
import { resolveStateDir } from "../config/paths.js";
import { parseStrictNonNegativeInteger } from "../infra/parse-finite-number.js";

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

export function resolveRemoteClawStateSqliteDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveRemoteClawStateRootDir(env), "state");
}

export function resolveRemoteClawStateSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveRemoteClawStateSqliteDir(env), "remoteclaw.sqlite");
}
