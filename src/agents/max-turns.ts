import type { RemoteClawConfig } from "../config/config.js";

const normalizePositiveInt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : undefined;

/**
 * Resolve the `maxTurns` limit for an agent run.
 *
 * Priority: explicit override > agent defaults config > undefined (CLI decides).
 */
export function resolveAgentMaxTurns(opts: {
  cfg?: RemoteClawConfig;
  override?: number | null;
}): number | undefined {
  const override = normalizePositiveInt(opts.override);
  if (override !== undefined) {
    return override;
  }
  return normalizePositiveInt(opts.cfg?.agents?.defaults?.maxTurns);
}
