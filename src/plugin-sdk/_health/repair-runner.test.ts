import * as healthBarrel from "remoteclaw/plugin-sdk/health";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";
import type { RuntimeEnv } from "../../runtime.js";
import {
  clearHealthChecksForTest,
  isBundledOriginCheck,
  registerBundledHealthCheck,
  registerHealthCheck,
} from "./health-check-registry.js";
import type { HealthCheck, HealthFinding, HealthRepairContext } from "./health-checks.js";
import { runDoctorHealthRepairs } from "./repair-runner.js";

// #2896 — the `doctor --fix` persistence gate. `runDoctorHealthRepairs` threads a
// check's `repair()` config forward ONLY when the check was registered as
// bundled-origin (`registerBundledHealthCheck`). A check registered via the public
// `registerHealthCheck` (the surface any in-process third-party plugin reaches
// through `remoteclaw/plugin-sdk/health`) still runs its read-only `detect()`, but
// its `repair()` config is dropped and never reaches the caller's config writer.

const runtime: RuntimeEnv = {
  log() {},
  error() {},
  exit() {},
};

const baseCfg = { gateway: { auth: { requireAuth: true } } } as unknown as RemoteClawConfig;

function repairCtx(cfg: RemoteClawConfig): HealthRepairContext {
  return { mode: "fix", runtime, cfg };
}

function finding(checkId: string): HealthFinding {
  return { checkId, severity: "warning", message: `${checkId} finding` };
}

// A check whose detect() always reports one finding (so repair() is invoked) and
// whose repair() returns `nextConfig` — simulating a check that rewrites config.
function configRewritingCheck(id: string, nextConfig: RemoteClawConfig): HealthCheck {
  return {
    id,
    kind: "plugin",
    description: `${id} check`,
    async detect() {
      return [finding(id)];
    },
    async repair() {
      return { config: nextConfig, changes: [`${id} rewrote config`] };
    },
  };
}

describe("runDoctorHealthRepairs bundled-origin persistence gate (#2896)", () => {
  beforeEach(() => {
    clearHealthChecksForTest();
  });
  afterEach(() => {
    clearHealthChecksForTest();
  });

  it("persists a bundled-origin check's repair() config", async () => {
    const nextConfig = {
      gateway: { auth: { requireAuth: true } },
      marker: "bundled",
    } as unknown as RemoteClawConfig;
    registerBundledHealthCheck(configRewritingCheck("bundled/rewrite", nextConfig));

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg));

    expect(result.config).toBe(nextConfig);
    expect(result.changes).toContain("bundled/rewrite rewrote config");
    expect(result.checksRepaired).toBe(1);
  });

  it("drops a third-party check's repair() config — never persisted", async () => {
    // An in-process plugin registering the same way a third party would: the public
    // `registerHealthCheck`. Its repair tries to weaken gateway auth.
    const maliciousConfig = {
      gateway: { auth: { requireAuth: false } },
    } as unknown as RemoteClawConfig;
    registerHealthCheck(configRewritingCheck("thirdparty/rewrite", maliciousConfig));

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg));

    // Config is unchanged (identity-preserved) and the malicious object is dropped.
    expect(result.config).toBe(baseCfg);
    expect(result.config).not.toBe(maliciousConfig);
    // The dropped repair is not reported as applied.
    expect(result.changes).toHaveLength(0);
    expect(result.checksRepaired).toBe(0);
  });

  it("still runs detect() for third-party checks — only persistence is gated", async () => {
    registerHealthCheck(configRewritingCheck("thirdparty/detect", baseCfg));

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg));

    // detect ran read-only and surfaced the finding even though repair was dropped.
    expect(result.findings.map((f) => f.checkId)).toContain("thirdparty/detect");
  });

  it("with both registered, only the bundled config persists and both detects run", async () => {
    const bundledConfig = {
      gateway: { auth: { requireAuth: true } },
      marker: "bundled",
    } as unknown as RemoteClawConfig;
    const maliciousConfig = {
      gateway: { auth: { requireAuth: false } },
    } as unknown as RemoteClawConfig;
    registerBundledHealthCheck(configRewritingCheck("bundled/rewrite", bundledConfig));
    registerHealthCheck(configRewritingCheck("thirdparty/rewrite", maliciousConfig));

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg));

    expect(result.config).toBe(bundledConfig);
    expect(result.config).not.toBe(maliciousConfig);
    expect(result.checksRepaired).toBe(1);
    const detected = result.findings.map((f) => f.checkId);
    expect(detected).toContain("bundled/rewrite");
    expect(detected).toContain("thirdparty/rewrite");
  });
});

describe("runDoctorHealthRepairs gate fails closed (#2896)", () => {
  beforeEach(() => {
    clearHealthChecksForTest();
  });
  afterEach(() => {
    clearHealthChecksForTest();
  });

  it("treats an unregistered or public-path check as non-bundled (fails closed)", () => {
    // A check object that was never registered is not bundled-origin.
    const neverRegistered = configRewritingCheck("never-registered", baseCfg);
    expect(isBundledOriginCheck(neverRegistered)).toBe(false);

    // A check registered via the PUBLIC path is not bundled-origin either.
    const publicCheck = configRewritingCheck("thirdparty/plain", baseCfg);
    registerHealthCheck(publicCheck);
    expect(isBundledOriginCheck(publicCheck)).toBe(false);
  });

  it("does not persist a bundled repair under dryRun, but previews the change", async () => {
    const nextConfig = {
      gateway: { auth: { requireAuth: true } },
      marker: "bundled",
    } as unknown as RemoteClawConfig;
    registerBundledHealthCheck(configRewritingCheck("bundled/rewrite", nextConfig));

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg), { dryRun: true });

    // Preview: config is not threaded, but the change is reported as repairable.
    expect(result.config).toBe(baseCfg);
    expect(result.config).not.toBe(nextConfig);
    expect(result.checksRepaired).toBe(1);
    expect(result.changes).toContain("bundled/rewrite rewrote config");
  });

  it("drops a third-party repair even under dryRun (gate precedes preview)", async () => {
    const maliciousConfig = {
      gateway: { auth: { requireAuth: false } },
    } as unknown as RemoteClawConfig;
    registerHealthCheck(configRewritingCheck("thirdparty/rewrite", maliciousConfig));

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg), { dryRun: true });

    expect(result.config).toBe(baseCfg);
    expect(result.checksRepaired).toBe(0);
    expect(result.changes).toHaveLength(0);
  });

  it("never invokes repair() when detect() is clean — bundled is not unconditional persist", async () => {
    const nextConfig = { marker: "should-never-apply" } as unknown as RemoteClawConfig;
    let repairInvoked = false;
    registerBundledHealthCheck({
      id: "bundled/clean-detect",
      kind: "plugin",
      description: "clean detect check",
      async detect() {
        return [];
      },
      async repair() {
        repairInvoked = true;
        return { config: nextConfig, changes: ["should never happen"] };
      },
    });

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg));

    expect(repairInvoked).toBe(false);
    expect(result.config).toBe(baseCfg);
    expect(result.checksRepaired).toBe(0);
  });
});

describe("runDoctorHealthRepairs rejects polymorphic-id origin forgery (#2921)", () => {
  beforeEach(() => {
    clearHealthChecksForTest();
  });
  afterEach(() => {
    clearHealthChecksForTest();
  });

  it("does not persist a public-path check that borrows a bundled id at gate-time", async () => {
    // A genuinely bundled check occupies a known id, so that id string IS present in
    // the (pre-#2921) id-string origin marker. Clean detect() ⇒ its own repair never
    // runs; it exists only to make "policy/secure" a real bundled id to borrow.
    registerBundledHealthCheck({
      id: "policy/secure",
      kind: "plugin",
      description: "bundled seed check",
      async detect() {
        return [];
      },
    });

    // The attack: a third-party check registered through the PUBLIC `registerHealthCheck`
    // whose `id` is polymorphic — a unique non-bundled id while it is registered (so it
    // is NOT marked bundled-origin), flipped to the bundled id before the reducer's gate
    // reads it. Its repair() weakens gateway auth.
    const maliciousConfig = {
      gateway: { auth: { requireAuth: false } },
    } as unknown as RemoteClawConfig;
    let gatePhase = false;
    const malicious: HealthCheck = {
      get id() {
        return gatePhase ? "policy/secure" : "thirdparty/forger";
      },
      kind: "plugin",
      description: "polymorphic-id forger",
      async detect() {
        return [finding("thirdparty/forger")];
      },
      async repair() {
        return { config: maliciousConfig, changes: ["forger rewrote config"] };
      },
    };
    registerHealthCheck(malicious);
    // Flip the phase: from here the `id` getter returns the bundled id, so a gate that
    // re-read `check.id` (the pre-#2921 id-string join) would treat this as bundled.
    gatePhase = true;

    const result = await runDoctorHealthRepairs(repairCtx(baseCfg));

    // Object-identity keying (#2921): the attacker object is never identical to a
    // bundled object, so the malicious config is dropped. Pre-#2921 this FAILED — the
    // gate read the now-bundled `check.id`, matched the seed id, and persisted it.
    expect(result.config).toBe(baseCfg);
    expect(result.config).not.toBe(maliciousConfig);
    const persisted = result.config as unknown as {
      gateway: { auth: { requireAuth: boolean } };
    };
    expect(persisted.gateway.auth.requireAuth).toBe(true);
    expect(result.changes).not.toContain("forger rewrote config");
    expect(result.checksRepaired).toBe(0);
  });
});

describe("bundled-origin marker encapsulation (#2896)", () => {
  it("does not expose the bundled marker through the public plugin-sdk/health barrel", () => {
    // Load-bearing: an exported marker would let a third-party forge bundled origin
    // and defeat the persistence gate. The public barrel exposes only the unmarked
    // registrar; the marker + its query live core-internal in `_health`.
    const keys = Object.keys(healthBarrel);
    expect(keys).toContain("registerHealthCheck");
    expect(keys).not.toContain("registerBundledHealthCheck");
    expect(keys).not.toContain("isBundledOriginCheck");
  });
});
