import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { ensurePluginRegistryLoaded } from "../cli/plugin-registry.js";
import type { RemoteClawConfig } from "../config/config.js";
import { runDoctorLintChecks } from "../plugin-sdk/_health/doctor-lint-flow.js";
import { listHealthChecks } from "../plugin-sdk/_health/health-check-registry.js";
import type {
  HealthCheckContext,
  HealthRepairContext,
} from "../plugin-sdk/_health/health-checks.js";
import { runDoctorHealthRepairs } from "../plugin-sdk/_health/repair-runner.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";

export interface RunPolicyDoctorChecksParams {
  readonly runtime: RuntimeEnv;
  readonly cfg: RemoteClawConfig;
  readonly configPath: string;
  readonly prompter: { readonly shouldRepair: boolean };
}

// Runs the plugin-registered doctor health checks (currently the policy ext) as
// part of the core `doctor` command. `detect` is pure-read and always runs; the
// bounded `repair` runs only under `--fix` (prompter.shouldRepair) and is itself
// gated per-check on the plugin's own config (`workspaceRepairs`). The returned
// config is threaded back to the caller, which persists any change through the
// doctor's existing `shouldWriteConfig` → `writeConfigFile` path — no new writer.
export async function runPolicyDoctorChecks({
  runtime,
  cfg,
  configPath,
  prompter,
}: RunPolicyDoctorChecksParams): Promise<RemoteClawConfig> {
  // Bundled plugins register their doctor checks in `register()` at load time; this
  // is a belt-and-suspenders load so the checks are present regardless of call order.
  // Idempotent.
  ensurePluginRegistryLoaded();

  const checks = listHealthChecks();
  if (checks.length === 0) {
    return cfg;
  }

  const ctx: HealthCheckContext = {
    mode: "doctor",
    runtime,
    cfg,
    cwd: resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg)),
    configPath,
  };

  // Detect (pure read): surface findings from every registered health check. The
  // lint runner wraps each `detect` in try/catch, so a throwing check degrades to an
  // error finding rather than crashing the whole `doctor` command.
  const { findings } = await runDoctorLintChecks(ctx, { checks });
  if (findings.length > 0) {
    note(
      findings.map((finding) => `[${finding.severity}] ${finding.message}`).join("\n"),
      "Policy conformance",
    );
  }

  // Repair is gated on `--fix`. The reducer re-detects, invokes each check's
  // `repair` (which self-gates on the plugin's `workspaceRepairs` config), threads
  // the returned config forward, and reports the applied changes.
  if (prompter.shouldRepair) {
    const repairCtx: HealthRepairContext = { ...ctx, mode: "fix" };
    const result = await runDoctorHealthRepairs(repairCtx, { checks });
    cfg = result.config;
    if (result.changes.length > 0) {
      note(result.changes.join("\n"), "Policy repairs applied");
    }
  }

  return cfg;
}
