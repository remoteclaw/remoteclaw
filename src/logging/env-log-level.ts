import { normalizeOptionalString } from "@remoteclaw/normalization-core/string-coerce";
import { ALLOWED_LOG_LEVELS, type LogLevel, tryParseLogLevel } from "./levels.js";
import { loggingState } from "./state.js";

export function resolveEnvLogLevelOverride(): LogLevel | undefined {
  const trimmed = normalizeOptionalString(process.env.REMOTECLAW_LOG_LEVEL) ?? "";
  if (!trimmed) {
    loggingState.invalidEnvLogLevelValue = null;
    return undefined;
  }
  const parsed = tryParseLogLevel(trimmed);
  if (parsed) {
    loggingState.invalidEnvLogLevelValue = null;
    return parsed;
  }
  if (loggingState.invalidEnvLogLevelValue !== trimmed) {
    loggingState.invalidEnvLogLevelValue = trimmed;
    process.stderr.write(
      `[remoteclaw] Ignoring invalid REMOTECLAW_LOG_LEVEL="${trimmed}" (allowed: ${ALLOWED_LOG_LEVELS.join("|")}).\n`,
    );
  }
  return undefined;
}
