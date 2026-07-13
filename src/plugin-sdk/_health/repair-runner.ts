import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";
import { uniqueStrings } from "../string-coerce-runtime.js";
import { scrubDoctorErrorMessage } from "./doctor-error-message.js";
import { listHealthChecks } from "./health-check-registry.js";
import type {
  HealthCheck,
  HealthFinding,
  HealthRepairContext,
  HealthRepairDiff,
  HealthRepairEffect,
} from "./health-checks.js";

// Fork-local port of the upstream doctor-repair-flow reducer, reduced to the
// SPLIT-contract path (detect + optional repair). The upstream runnable-contract
// path and `normalizeHealthCheck` adapter are intentionally dropped: every policy
// health check exposes a plain `detect`/`repair` pair. The reducer is pure — it
// threads `result.config` forward and returns it; the CALLER persists.
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
  readonly warnings: readonly string[];
  readonly diffs: readonly HealthRepairDiff[];
  readonly effects: readonly HealthRepairEffect[];
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
  const warnings: string[] = [];
  const diffs: HealthRepairDiff[] = [];
  const effects: HealthRepairEffect[] = [];
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
    warnings.push(...runResult.warnings);
    diffs.push(...runResult.diffs);
    effects.push(...runResult.effects);
    checksRepaired += runResult.checksRepaired;
    checksValidated += runResult.checksValidated;
  }

  return {
    config: cfg,
    findings,
    remainingFindings,
    changes,
    warnings,
    diffs,
    effects,
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
  const warnings: string[] = [];
  const diffs: HealthRepairDiff[] = [];
  const effects: HealthRepairEffect[] = [];
  let cfg = ctx.cfg;
  let checksRepaired = 0;
  let checksValidated = 0;

  let checkFindings: readonly HealthFinding[];
  try {
    checkFindings = await check.detect(ctx);
  } catch (err) {
    warnings.push(`${check.id} detect failed: ${scrubDoctorErrorMessage(err)}`);
    return repairRunResult(cfg, findings, remainingFindings, changes, warnings, diffs, effects);
  }
  findings.push(...checkFindings);
  if (checkFindings.length === 0 || check.repair === undefined) {
    return repairRunResult(cfg, findings, remainingFindings, changes, warnings, diffs, effects);
  }

  try {
    const result = await check.repair(
      { ...ctx, dryRun: opts.dryRun === true, diff: opts.diff === true },
      checkFindings,
    );
    warnings.push(...(result.warnings ?? []));
    diffs.push(...(result.diffs ?? []));
    effects.push(...(result.effects ?? []));
    const status = result.status ?? "repaired";
    if (status !== "repaired") {
      warnings.push(`${check.id} repair ${status}${result.reason ? `: ${result.reason}` : ""}`);
      return repairRunResult(cfg, findings, remainingFindings, changes, warnings, diffs, effects);
    }
    if (result.config !== undefined && opts.dryRun !== true) {
      cfg = result.config;
    }
    changes.push(...result.changes);
    checksRepaired++;
    if (opts.dryRun === true) {
      return repairRunResult(cfg, findings, remainingFindings, changes, warnings, diffs, effects, {
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
      if (validationFindings.length > 0) {
        warnings.push(`${check.id} repair left ${validationFindings.length} finding(s)`);
      }
    } catch (err) {
      warnings.push(`${check.id} validation failed: ${scrubDoctorErrorMessage(err)}`);
    }
  } catch (err) {
    warnings.push(`${check.id} repair failed: ${scrubDoctorErrorMessage(err)}`);
  }

  return repairRunResult(cfg, findings, remainingFindings, changes, warnings, diffs, effects, {
    checksRepaired,
    checksValidated,
  });
}

function repairRunResult(
  config: RemoteClawConfig,
  findings: readonly HealthFinding[],
  remainingFindings: readonly HealthFinding[],
  changes: readonly string[],
  warnings: readonly string[],
  diffs: readonly HealthRepairDiff[],
  effects: readonly HealthRepairEffect[],
  counts: { checksRepaired?: number; checksValidated?: number } = {},
): DoctorRepairRunResult {
  return {
    config,
    findings,
    remainingFindings,
    changes,
    warnings,
    diffs,
    effects,
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
