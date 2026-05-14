import path from "node:path";
import type { RemoteClawConfig } from "../config/types.js";
import {
  POSIX_REMOTECLAW_TMP_DIR,
  resolvePreferredRemoteClawTmpDir,
} from "../infra/tmp-remoteclaw-dir.js";

const LOG_PREFIX = "remoteclaw";
const LOG_SUFFIX = ".log";

function canUseNodeFs(): boolean {
  const getBuiltinModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown;
    }
  ).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    return false;
  }
  try {
    return getBuiltinModule("fs") !== undefined;
  } catch {
    return false;
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveDefaultRollingLogFile(date = new Date()): string {
  const logDir = canUseNodeFs() ? resolvePreferredRemoteClawTmpDir() : POSIX_REMOTECLAW_TMP_DIR;
  return path.join(logDir, `${LOG_PREFIX}-${formatLocalDate(date)}${LOG_SUFFIX}`);
}

export function resolveConfiguredLogFilePath(config?: RemoteClawConfig | null): string {
  return config?.logging?.file ?? resolveDefaultRollingLogFile();
}
