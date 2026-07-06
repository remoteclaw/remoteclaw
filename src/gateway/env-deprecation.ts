import { isVitestRuntimeEnv } from "../infra/env.js";

const LEGACY_ENV_PREFIXES = ["CLAWDBOT_", "MOLTBOT_"] as const;
type LegacyEnvPrefix = (typeof LEGACY_ENV_PREFIXES)[number];

let warned = false;

export function warnLegacyRemoteClawEnvVars(env: NodeJS.ProcessEnv = process.env): void {
  if (warned || isVitestRuntimeEnv(env)) {
    return;
  }

  const prefixCounts = new Map<LegacyEnvPrefix, number>();
  for (const key of Object.keys(env)) {
    const prefix = LEGACY_ENV_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (prefix) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  const legacyVarCount = [...prefixCounts.values()].reduce((total, count) => total + count, 0);
  if (legacyVarCount === 0) {
    return;
  }

  const detectedPrefixes = LEGACY_ENV_PREFIXES.filter((prefix) => prefixCounts.has(prefix))
    .map((prefix) => `${prefix}*`)
    .join(", ");

  process.emitWarning(
    [
      `Legacy ${detectedPrefixes} environment variables were detected (${legacyVarCount} total), but RemoteClaw only reads REMOTECLAW_* names now.`,
      "Rename them by replacing the legacy prefix with REMOTECLAW_; the old names are ignored.",
    ].join("\n"),
    { code: "REMOTECLAW_LEGACY_ENV_VARS", type: "DeprecationWarning" },
  );
  warned = true;
}

export function resetLegacyRemoteClawEnvWarningForTest(): void {
  warned = false;
}
