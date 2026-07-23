/** Coerces cron schedule number fields with strict finite-number parsing. */
import { parseStrictFiniteNumber } from "@remoteclaw/normalization-core/number-coercion";

export function coerceFiniteScheduleNumber(value: unknown): number | undefined {
  return parseStrictFiniteNumber(value);
}
