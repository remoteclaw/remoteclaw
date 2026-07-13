// Fork-local barrel over the minimal doctor/health surface a bundled plugin
// (e.g. `extensions/policy`) needs. Upstream `openclaw/plugin-sdk/health`
// aggregated `src/flows/*`, all of which the RemoteClaw fork gutted; this
// re-introduces only the pure pieces (types, registry, lint/repair reducers)
// under `src/plugin-sdk/_health/`, plus the config/agent-scope helpers the
// policy ext consumes. The upstream `doctor-core-checks` exports are omitted:
// the ext does not use them and that module dragged gutted dependencies.
export { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
export { readConfigFileSnapshot } from "../config/io.js";
export type { RemoteClawConfig } from "../config/types.remoteclaw.js";
export {
  exitCodeFromFindings,
  runDoctorLintChecks,
  type DoctorLintRunOptions,
  type DoctorLintRunResult,
} from "./_health/doctor-lint-flow.js";
export {
  healthFindingMeetsSeverity,
  parseHealthFindingSeverity,
  type HealthCheck,
  type HealthCheckContext,
  type HealthCheckMode,
  type HealthCheckScope,
  type HealthFinding,
  type HealthFindingSeverity,
  type HealthRepairContext,
  type HealthRepairDiff,
  type HealthRepairEffect,
  type HealthRepairResult,
} from "./_health/health-checks.js";
// `registerHealthCheck` is public for upstream parity but intended first-party only
// (the bundled `policy` ext); see the ratified open-registration posture at its
// definition in `./_health/health-check-registry.js`.
export {
  getHealthCheck,
  listHealthChecks,
  registerHealthCheck,
} from "./_health/health-check-registry.js";
export {
  runDoctorHealthRepairs,
  type DoctorRepairRunOptions,
  type DoctorRepairRunResult,
} from "./_health/repair-runner.js";
