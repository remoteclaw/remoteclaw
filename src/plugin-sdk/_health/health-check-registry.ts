import type { HealthCheck } from "./health-checks.js";

const REGISTRY = new Map<string, HealthCheck>();

export class HealthCheckRegistrationError extends Error {
  readonly code = "OC_DOCTOR_DUPLICATE_CHECK";
  constructor(readonly checkId: string) {
    super(`health check already registered: ${checkId}`);
    this.name = "HealthCheckRegistrationError";
  }
}

// Registers a doctor health check into the process-wide registry.
//
// Ratified posture (PR #2895): health-check registration is INTENDED first-party
// only — in practice the sole registrant is the bundled `policy` extension. The
// export is nonetheless public (package.json exposes `remoteclaw/plugin-sdk/health`)
// for parity with upstream OpenClaw, which shipped it as a plugin-SDK surface. A
// third-party in-process plugin CAN technically register a check whose `repair()`
// returns arbitrary config, which a victim's `doctor --fix` would then persist — but
// that exposure is bounded: such a plugin already runs in-process with full host
// capability (it gains nothing new via this API), and installing it is gated by the
// plugin install-scan. Constraining repair-config persistence to bundled-origin
// checks is a tracked future hardening option, deliberately not taken here.
export function registerHealthCheck(check: HealthCheck): void {
  if (REGISTRY.has(check.id)) {
    throw new HealthCheckRegistrationError(check.id);
  }
  REGISTRY.set(check.id, check);
}

export function listHealthChecks(): readonly HealthCheck[] {
  return [...REGISTRY.values()];
}

export function getHealthCheck(id: string): HealthCheck | undefined {
  return REGISTRY.get(id);
}

export function clearHealthChecksForTest(): void {
  REGISTRY.clear();
}
