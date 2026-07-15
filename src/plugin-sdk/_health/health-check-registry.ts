import type { HealthCheck } from "./health-checks.js";

const REGISTRY = new Map<string, HealthCheck>();

// Object identities of checks registered via the bundled-origin path
// (`registerBundledHealthCheck`). Keyed on OBJECT IDENTITY — not the check's `id`
// string — because `HealthCheck.kind`/`.source`/`.id` are all self-declared on the
// check object and therefore spoofable, so a check's own fields can never certify its
// provenance. `id` in particular is not even stable: a polymorphic `get id()` can
// return one value at registration and another when the gate reads it (#2921), which
// would defeat any id-string join key. Object identity is unforgeable — an attacker
// cannot make their check object BE a bundled check object — so membership here is a
// structural gate on whether a check's `repair()` output may mutate persisted config
// (see `repair-runner.ts`, #2896, #2921). Reassigned rather than `.clear()`d on test
// reset because a `WeakSet` is not enumerable.
let BUNDLED_ORIGIN = new WeakSet<HealthCheck>();

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
    BUNDLED_ORIGIN.add(check);
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

// Whether `check` was registered via the bundled-origin path. Keyed on the check's
// OBJECT IDENTITY, so the caller must pass the very object the reducer is about to
// persist for. This makes the gate immune to a polymorphic `get id()` that borrows a
// bundled check's `id` at gate-time (#2921): an object the caller/attacker controls is
// never identical to a bundled check object registered through the internal path.
export function isBundledOriginCheck(check: HealthCheck): boolean {
  return BUNDLED_ORIGIN.has(check);
}

export function listHealthChecks(): readonly HealthCheck[] {
  return [...REGISTRY.values()];
}

export function getHealthCheck(id: string): HealthCheck | undefined {
  return REGISTRY.get(id);
}

export function clearHealthChecksForTest(): void {
  REGISTRY.clear();
  // `WeakSet` has no `.clear()`; reassign a fresh set so a test re-registering the
  // same object instance does not inherit a stale bundled-origin marking.
  BUNDLED_ORIGIN = new WeakSet<HealthCheck>();
}
