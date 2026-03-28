import { formatCliCommand } from "../cli/command-format.js";
import { assertSupportedRuntime } from "../infra/runtime-guard.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import { handleReset } from "./onboard-helpers.js";
import { runInteractiveOnboarding } from "./onboard-interactive.js";
import { runNonInteractiveOnboarding } from "./onboard-non-interactive.js";
import type { OnboardOptions, ResetScope } from "./onboard-types.js";

const VALID_RESET_SCOPES = new Set<ResetScope>(["config", "config+creds+sessions", "full"]);

export async function onboardCommand(opts: OnboardOptions, runtime: RuntimeEnv = defaultRuntime) {
  assertSupportedRuntime(runtime);
  const flow = opts.flow === "manual" ? ("advanced" as const) : opts.flow;
  const normalizedOpts = flow === opts.flow ? opts : { ...opts, flow };

  if (normalizedOpts.resetScope && !VALID_RESET_SCOPES.has(normalizedOpts.resetScope)) {
    runtime.error('Invalid --reset-scope. Use "config", "config+creds+sessions", or "full".');
    runtime.exit(1);
    return;
  }

  if (normalizedOpts.nonInteractive && normalizedOpts.acceptRisk !== true) {
    runtime.error(
      [
        "Non-interactive onboarding requires explicit risk acknowledgement.",
        "Read: https://docs.remoteclaw.org/security",
        `Re-run with: ${formatCliCommand("remoteclaw onboard --non-interactive --accept-risk ...")}`,
      ].join("\n"),
    );
    runtime.exit(1);
    return;
  }

  if (normalizedOpts.reset) {
    const workspaceDefault = normalizedOpts.workspace;
    if (workspaceDefault) {
      await handleReset(
        normalizedOpts.resetScope ?? "full",
        resolveUserPath(workspaceDefault),
        runtime,
      );
    } else {
      await handleReset(normalizedOpts.resetScope ?? "config+creds+sessions", "", runtime);
    }
  }

  if (process.platform === "win32") {
    runtime.log(
      [
        "Windows detected — RemoteClaw runs great on WSL2!",
        "Native Windows might be trickier.",
        "Quick setup: wsl --install (one command, one reboot)",
        "Guide: https://docs.remoteclaw.org/windows",
      ].join("\n"),
    );
  }

  if (normalizedOpts.nonInteractive) {
    await runNonInteractiveOnboarding(normalizedOpts, runtime);
    return;
  }

  await runInteractiveOnboarding(normalizedOpts, runtime);
}

export type { OnboardOptions } from "./onboard-types.js";
