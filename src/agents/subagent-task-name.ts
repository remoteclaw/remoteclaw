/**
 * Subagent task-name normalization.
 *
 * Tool callers use this to validate optional named subagent targets while
 * keeping reserved target words out of user-defined task names.
 */
import { normalizeOptionalString } from "@remoteclaw/normalization-core/string-coerce";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  normalizeSubagentTaskName: "live",
} as const;

const SUBAGENT_TASK_NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const RESERVED_SUBAGENT_TASK_NAMES = new Set(["all", "last"]);

type NormalizeSubagentTaskNameResult =
  | { taskName?: string; error?: undefined }
  | { taskName?: undefined; error: string };

/** Normalizes and validates an optional subagent task name. */
export function normalizeSubagentTaskName(value: unknown): NormalizeSubagentTaskNameResult {
  const taskName = normalizeOptionalString(value);
  if (!taskName) {
    return {};
  }
  if (!SUBAGENT_TASK_NAME_RE.test(taskName)) {
    return {
      error: `Invalid taskName "${taskName}". Use 1-64 chars matching [a-z][a-z0-9_-]*.`,
    };
  }
  if (RESERVED_SUBAGENT_TASK_NAMES.has(taskName)) {
    return {
      error: `Invalid taskName "${taskName}". Reserved subagent targets cannot be used as taskName values.`,
    };
  }
  return { taskName };
}
