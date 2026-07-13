import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { registerPolicyCli } from "./src/cli.js";
import { registerPolicyDoctorChecks } from "./src/doctor/register.js";

const plugin = {
  id: "policy",
  name: "Policy",
  description: "Adds policy-backed doctor checks for workspace conformance.",
  register(api: RemoteClawPluginApi) {
    api.registerCli(
      (ctx) => {
        registerPolicyCli(ctx.program);
      },
      { commands: ["policy"] },
    );
    // Populate the fork-local health-check registry at plugin load, so the core
    // `doctor` command sees the policy checks when it iterates `listHealthChecks()`.
    // Idempotent: `registerPolicyDoctorChecks` guards on an internal `registered` flag.
    registerPolicyDoctorChecks();
  },
};

export default plugin;
