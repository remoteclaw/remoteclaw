import { formatCliCommand } from "../cli/command-format.js";
import { formatPluginPackagingRuntimeOutputRecoveryHint } from "../cli/config-recovery-hints.js";
import { type RemoteClawConfig, readConfigFileSnapshot } from "../config/config.js";
import { formatConfigIssueLines } from "../config/issue-format.js";
import { isPluginPackagingRuntimeOutputInvalidConfigSnapshot } from "../config/recovery-policy.js";
import type { RuntimeEnv } from "../runtime.js";

export async function requireValidConfigSnapshot(
  runtime: RuntimeEnv,
): Promise<RemoteClawConfig | null> {
  const snapshot = await readConfigFileSnapshot();
  if (snapshot.exists && !snapshot.valid) {
    const issues =
      snapshot.issues.length > 0
        ? formatConfigIssueLines(snapshot.issues, "-").join("\n")
        : "Unknown validation issue.";
    runtime.error(`RemoteClaw config is invalid: ${snapshot.path}\n${issues}`);
    runtime.error(
      isPluginPackagingRuntimeOutputInvalidConfigSnapshot(snapshot)
        ? `Fix: ${formatPluginPackagingRuntimeOutputRecoveryHint()}`
        : `Fix: ${formatCliCommand("remoteclaw doctor --fix")}`,
    );
    runtime.error(`Inspect: ${formatCliCommand("remoteclaw config validate")}`);
    runtime.exit(1);
    return null;
  }
  return snapshot.config;
}
