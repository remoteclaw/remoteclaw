import { normalizeVerboseLevel, type VerboseLevel } from "../auto-reply/thinking.js";
import type { SessionEntry } from "../config/sessions.js";

const INVALID_VERBOSE_LEVEL_ERROR = 'invalid verboseLevel (use "on"|"off"|"full")';

export function parseVerboseOverride(
  raw: unknown,
): { ok: true; value: VerboseLevel | null | undefined } | { ok: false; error: string } {
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: INVALID_VERBOSE_LEVEL_ERROR };
  }
  const normalized = normalizeVerboseLevel(raw);
  if (!normalized) {
    return { ok: false, error: INVALID_VERBOSE_LEVEL_ERROR };
  }
  return { ok: true, value: normalized };
}

export function applyVerboseOverride(entry: SessionEntry, level: VerboseLevel | null | undefined) {
  if (level === undefined) {
    return;
  }
  if (level === null) {
    delete entry.verboseLevel;
    return;
  }
  entry.verboseLevel = level;
}
