export const REMOTECLAW_CLI_ENV_VAR = "REMOTECLAW_CLI";
export const REMOTECLAW_CLI_ENV_VALUE = "1";

export function markRemoteClawExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [REMOTECLAW_CLI_ENV_VAR]: REMOTECLAW_CLI_ENV_VALUE,
  };
}

export function ensureRemoteClawExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[REMOTECLAW_CLI_ENV_VAR] = REMOTECLAW_CLI_ENV_VALUE;
  return env;
}
