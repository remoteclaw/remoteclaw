import type { RuntimeEnv } from "../../../runtime.js";
import type { OnboardOptions } from "../../onboard-types.js";

export function logNonInteractiveOnboardingJson(params: {
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  mode: "local" | "remote";
  workspaceDir?: string;
  runtimeChoice?: string;
  gateway?: {
    port: number;
    bind: string;
    authMode: string;
    tailscaleMode: string;
  };
  installDaemon?: boolean;
  daemonRuntime?: string;
  skipHealth?: boolean;
}) {
  if (!params.opts.json) {
    return;
  }
  params.runtime.log(
    JSON.stringify(
      {
        mode: params.mode,
        workspace: params.workspaceDir,
        runtime: params.runtimeChoice,
        gateway: params.gateway,
        installDaemon: Boolean(params.installDaemon),
        daemonRuntime: params.daemonRuntime,
        skipHealth: Boolean(params.skipHealth),
      },
      null,
      2,
    ),
  );
}
