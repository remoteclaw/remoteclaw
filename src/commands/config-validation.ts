import { formatCliCommand } from "../cli/command-format.js";
import { type RemoteClawConfig, readConfigFileSnapshot } from "../config/config.js";
import { formatConfigIssueLines } from "../config/issue-format.js";
import {
  buildPluginCompatibilityNotices,
  formatPluginCompatibilityNotice,
} from "../plugins/status.js";
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
    runtime.error(`Config invalid:\n${issues}`);
    runtime.error(`Fix the config or run ${formatCliCommand("remoteclaw doctor")}.`);
    runtime.exit(1);
    return null;
  }
  const compatibility = buildPluginCompatibilityNotices({ config: snapshot.config });
  if (compatibility.length > 0) {
    runtime.log(
      [
        `Plugin compatibility: ${compatibility.length} notice${compatibility.length === 1 ? "" : "s"}.`,
        ...compatibility
          .slice(0, 3)
          .map((notice) => `- ${formatPluginCompatibilityNotice(notice)}`),
        ...(compatibility.length > 3 ? [`- ... +${compatibility.length - 3} more`] : []),
        `Review: ${formatCliCommand("remoteclaw doctor")}`,
      ].join("\n"),
    );
  }
  return snapshot.config;
}
