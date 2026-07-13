import { listHealthChecks } from "remoteclaw/plugin-sdk/health";
import { clearHealthChecksForTest } from "remoteclaw/plugin-sdk/plugin-test-runtime";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  POLICY_CHECK_IDS,
  registerPolicyDoctorChecks,
  resetPolicyDoctorChecksForTest,
} from "./register.js";

// Module-singleton coverage relocated from src/commands/doctor-policy-checks.smoke.test.ts
// (test (i)) into the CI-run `test-extensions` lane, because src/commands/** is excluded
// from every fork vitest lane and the original smoke test never ran in CI.
//
// register.test.ts always registers through a CUSTOM host, so this is the ONLY test that
// exercises the DEFAULT registration path: `registerPolicyDoctorChecks()` with no host →
// the barrel's `registerPluginHealthCheck` → the shared registry Map that the core doctor
// reads via `listHealthChecks()`. If the ext ever registered into a different registry
// (wrong import, a local Map), this list would not contain the policy check ids.
//
// Scope note: under the vitest `remoteclaw/plugin-sdk/*` source aliases both surfaces
// collapse to src/plugin-sdk/_health/health-check-registry.ts, so this asserts the
// SOURCE-level shared-registry property. The dist/bundled two-instance regression (the
// `health` barrel bundled separately from the deep `_health` module, yielding two Maps) is
// separately guarded by the packaged-boot-smoke CI job, which boots the real tarball.

describe("policy doctor registry singleton", () => {
  beforeEach(() => {
    clearHealthChecksForTest();
    resetPolicyDoctorChecksForTest();
  });

  afterEach(() => {
    clearHealthChecksForTest();
    resetPolicyDoctorChecksForTest();
  });

  it("registers policy checks into the registry the core doctor reads", () => {
    expect(listHealthChecks()).toHaveLength(0);
    registerPolicyDoctorChecks();
    const ids = listHealthChecks().map((check) => check.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set(POLICY_CHECK_IDS));
  });
});
