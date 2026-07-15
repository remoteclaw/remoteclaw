import type { HealthCheck } from "./health-checks.js";

const REGISTRY = new Map<string, HealthCheck>();

// Ids of checks registered via the bundled-origin path (`registerBundledHealthCheck`).
// This is the ONLY trustworthy origin signal: `HealthCheck.kind`/`.source` are
// self-declared on the check object and therefore spoofable, so a check's own fields
// can never certify its provenance. Membership here gates whether a check's `repair()`
// output may mutate persisted config (see `repair-runner.ts` and #2896).
const BUNDLED_ORIGIN = new Set<string>();

export class HealthCheckRegistrationError extends Error {
  readonly code = "OC_DOCTOR_DUPLICATE_CHECK";
  constructor(readonly checkId: string) {
    super(`health check already registered: ${checkId}`);
    this.name = "HealthCheckRegistrationError";
  }
}

function register(check: HealthCheck, bundledOrigin: boolean): void {
  if (REGISTRY.has(check.id)) {
    throw new HealthCheckRegistrationError(check.id);
  }
  REGISTRY.set(check.id, check);
  if (bundledOrigin) {
    BUNDLED_ORIGIN.add(check.id);
  }
}

// Registers a doctor health check into the process-wide registry WITHOUT a
// bundled-origin marker. This is the PUBLIC registration path: `package.json`
// exposes it as `remoteclaw/plugin-sdk/health` (parity with upstream OpenClaw),
// so any in-process plugin can call it. A check registered here still runs its
// read-only `detect()`, but its `repair()` output can NOT mutate persisted config
// — the `doctor --fix` reducer drops config from non-bundled-origin checks (#2896).
export function registerHealthCheck(check: HealthCheck): void {
  register(check, false);
}

// Registers a doctor health check as BUNDLED-ORIGIN — the only path whose
// `repair()` output the `doctor --fix` reducer will persist. This function is
// deliberately NOT re-exported from `./health.ts` (the public `remoteclaw/plugin-sdk/health`
// barrel) and has no entry in `package.json` `exports`, so it is unreachable to
// external packages via module resolution. The framework calls it ONLY for a
// bundled extension's checks (keyed on the loader's non-forgeable plugin origin);
// see `extensions/policy` wiring. Keeping the marker off every exported subpath is
// load-bearing: an exported marker would let a third-party forge bundled origin and
// defeat the persistence gate.
export function registerBundledHealthCheck(check: HealthCheck): void {
  register(check, true);
}

// Whether the check registered under `id` was registered via the bundled-origin
// path. Ids are unique in the registry (duplicate registration throws), so this
// reliably reflects the provenance of the single check holding that id.
export function isBundledOriginCheck(id: string): boolean {
  return BUNDLED_ORIGIN.has(id);
}

export function listHealthChecks(): readonly HealthCheck[] {
  return [...REGISTRY.values()];
}

export function getHealthCheck(id: string): HealthCheck | undefined {
  return REGISTRY.get(id);
}

export function clearHealthChecksForTest(): void {
  REGISTRY.clear();
  BUNDLED_ORIGIN.clear();
}
