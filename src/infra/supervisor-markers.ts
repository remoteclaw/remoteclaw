export const SUPERVISOR_HINT_ENV_VARS = [
  // macOS launchd
  "LAUNCH_JOB_LABEL",
  "LAUNCH_JOB_NAME",
  // RemoteClaw service env markers
  "REMOTECLAW_LAUNCHD_LABEL",
  "REMOTECLAW_SYSTEMD_UNIT",
  "REMOTECLAW_SERVICE_MARKER",
  // Linux systemd
  "INVOCATION_ID",
  "SYSTEMD_EXEC_PID",
  "JOURNAL_STREAM",
] as const;

export function hasSupervisorHint(env: NodeJS.ProcessEnv = process.env): boolean {
  return SUPERVISOR_HINT_ENV_VARS.some((key) => {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}
