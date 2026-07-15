import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";
import { uniqueStrings } from "../string-coerce-runtime.js";
import { isBundledOriginCheck, listHealthChecks } from "./health-check-registry.js";
import type { HealthCheck, HealthFinding, HealthRepairContext } from "./health-checks.js";

// Fork-local port of the upstream doctor-repair-flow reducer, reduced to the
// SPLIT-contract path (detect + optional repair). The upstream runnable-contract
// path and `normalizeHealthCheck` adapter are intentionally dropped: every policy
// health check exposes a plain `detect`/`repair` pair. The reducer is pure — it
// threads `result.config` forward and returns it; the CALLER persists.
//
// The result reports `config` + `changes` (consumed by the sole caller,
// `runPolicyDoctorChecks`) plus the detect/validate bookkeeping. Upstream's
// `warnings`/`diffs`/`effects` accumulators were dropped: the fork's bounded
// policy-doctor never read them, and the collected-but-never-executed `effects`
// in particular invited a misread that they were being applied (#2897).
export interface DoctorRepairRunOptions {
  readonly checks?: readonly HealthCheck[];
  readonly dryRun?: boolean;
  readonly diff?: boolean;
}

export interface DoctorRepairRunResult {
  readonly config: RemoteClawConfig;
  readonly findings: readonly HealthFinding[];
  readonly remainingFindings: readonly HealthFinding[];
  readonly changes: readonly string[];
  readonly checksRun: number;
  readonly checksRepaired: number;
  readonly checksValidated: number;
}

export async function runDoctorHealthRepairs(
  ctx: HealthRepairContext,
  opts: DoctorRepairRunOptions = {},
): Promise<DoctorRepairRunResult> {
  const checks = opts.checks ?? listHealthChecks();
  const findings: HealthFinding[] = [];
  const remainingFindings: HealthFinding[] = [];
  const changes: string[] = [];
  let cfg = ctx.cfg;
  let checksRepaired = 0;
  let checksValidated = 0;

  for (const check of checks) {
    const detectCtx: HealthRepairContext = { ...ctx, cfg };
    const runResult = await runSplitHealthCheck(check, detectCtx, opts);
    cfg = runResult.config;
    findings.push(...runResult.findings);
    remainingFindings.push(...runResult.remainingFindings);
    changes.push(...runResult.changes);
    checksRepaired += runResult.checksRepaired;
    checksValidated += runResult.checksValidated;
  }

  return {
    config: cfg,
    findings,
    remainingFindings,
    changes,
    checksRun: checks.length,
    checksRepaired,
    checksValidated,
  };
}

async function runSplitHealthCheck(
  check: HealthCheck,
  ctx: HealthRepairContext,
  opts: DoctorRepairRunOptions,
): Promise<DoctorRepairRunResult> {
  const findings: HealthFinding[] = [];
  const remainingFindings: HealthFinding[] = [];
  const changes: string[] = [];
  let cfg = ctx.cfg;
  let checksRepaired = 0;
  let checksValidated = 0;

  let checkFindings: readonly HealthFinding[];
  try {
    checkFindings = await check.detect(ctx);
  } catch {
    // A throwing detect yields no findings for this check; the reducer degrades gracefully.
    return repairRunResult(cfg, findings, remainingFindings, changes);
  }
  findings.push(...checkFindings);
  if (checkFindings.length === 0 || check.repair === undefined) {
    return repairRunResult(cfg, findings, remainingFindings, changes);
  }

  try {
    const result = await check.repair(
      { ...ctx, dryRun: opts.dryRun === true, diff: opts.diff === true },
      checkFindings,
    );
    const status = result.status ?? "repaired";
    if (status !== "repaired") {
      return repairRunResult(cfg, findings, remainingFindings, changes);
    }
    // #2896 defense-in-depth: only a BUNDLED-ORIGIN check may mutate persisted
    // config through repair(). Every check's detect() already ran (read-only,
    // above) — this gates PERSISTENCE only, so third-party checks still surface
    // findings. A non-bundled-origin repair is dropped wholesale: its config is
    // never threaded to the caller's config writer, its changes are not reported,
    // and it is not counted as repaired. There is no other persistence channel
    // (upstream file/effect application was gutted in the fork), so dropping the
    // returned config fully neutralizes an untrusted check's attempt to rewrite it.
    // #2921: the gate keys on the check's OBJECT IDENTITY (`check`), not its `check.id`
    // string, so a public-path check cannot borrow a bundled check's id at gate-time
    // through a polymorphic `get id()`.
    if (!isBundledOriginCheck(check)) {
      return repairRunResult(cfg, findings, remainingFindings, changes);
    }
    if (result.config !== undefined && opts.dryRun !== true) {
      cfg = result.config;
    }
    changes.push(...result.changes);
    checksRepaired++;
    if (opts.dryRun === true) {
      return repairRunResult(cfg, findings, remainingFindings, changes, {
        checksRepaired,
        checksValidated,
      });
    }
    try {
      const validationFindings = await check.detect(
        { ...ctx, cfg },
        createValidationScope(findings),
      );
      remainingFindings.push(...validationFindings);
      checksValidated++;
    } catch {
      // Post-repair re-detect threw; leave checksValidated unincremented.
    }
  } catch {
    // A throwing repair leaves this check unrepaired; the reducer degrades gracefully.
  }

  return repairRunResult(cfg, findings, remainingFindings, changes, {
    checksRepaired,
    checksValidated,
  });
}

function repairRunResult(
  config: RemoteClawConfig,
  findings: readonly HealthFinding[],
  remainingFindings: readonly HealthFinding[],
  changes: readonly string[],
  counts: { checksRepaired?: number; checksValidated?: number } = {},
): DoctorRepairRunResult {
  return {
    config,
    findings,
    remainingFindings,
    changes,
    checksRun: 1,
    checksRepaired: counts.checksRepaired ?? 0,
    checksValidated: counts.checksValidated ?? 0,
  };
}

function createValidationScope(findings: readonly HealthFinding[]) {
  return {
    findings,
    paths: uniqueDefined(findings.map((finding) => finding.path)),
    ocPaths: uniqueDefined(findings.map((finding) => finding.ocPath)),
  };
}

function uniqueDefined(values: readonly (string | undefined)[]): readonly string[] {
  return uniqueStrings(values.filter((value): value is string => value !== undefined));
}
