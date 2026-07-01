import path from "node:path";
import { resolvePreferredRemoteClawTmpDir } from "../../infra/tmp-remoteclaw-dir.js";
import { resetLogger, setLoggerOverride } from "../logger.js";
import { createDiagnosticLogRecordCapture } from "./diagnostic-log-capture.js";

export function createWarnLogCapture(prefix: string) {
  const capture = createDiagnosticLogRecordCapture();
  setLoggerOverride({
    level: "warn",
    consoleLevel: "silent",
    file: path.join(
      resolvePreferredRemoteClawTmpDir(),
      `${prefix}-${process.pid}-${Date.now()}.log`,
    ),
  });
  return {
    async findText(needle: string): Promise<string | undefined> {
      await capture.flush();
      return capture.records
        .flatMap((record) => [record.message, ...Object.values(record.attributes ?? {})])
        .filter((value): value is string => typeof value === "string")
        .find((value) => value.includes(needle));
    },
    cleanup() {
      capture.cleanup();
      setLoggerOverride(null);
      resetLogger();
    },
  };
}
