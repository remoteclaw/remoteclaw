// Setup command registration: baseline setup by default, onboarding wizard when wizard flags appear.
import type { Command } from "commander";
import { onboardCommand } from "../../commands/onboard.js";
import { setupCommand } from "../../commands/setup.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { hasExplicitOptions } from "../command-options.js";

/** Register the `setup` command and route wizard-style invocations to onboarding. */
export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Initialize ~/.remoteclaw/remoteclaw.json and the agent workspace")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/setup", "docs.remoteclaw.org/cli/setup")}\n`,
    )
    .option(
      "--workspace <dir>",
      "Agent workspace directory (required; stored per-agent in agents.list[].workspace)",
    )
    .option("--wizard", "Run the interactive onboarding wizard", false)
    .option("--non-interactive", "Run the wizard without prompts", false)
    .option("--mode <mode>", "Wizard mode: local|remote")
    .option("--remote-url <url>", "Remote Gateway WebSocket URL")
    .option("--remote-token <token>", "Remote Gateway token (optional)")
    .action(async (opts, command) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const hasWizardFlags = hasExplicitOptions(command, [
          "wizard",
          "nonInteractive",
          "mode",
          "importFrom",
          "importSource",
          "importSecrets",
          "remoteUrl",
          "remoteToken",
        ]);
        // Any onboarding-only flag means the user intended the wizard path even without --wizard.
        if (opts.wizard || hasWizardFlags) {
          await onboardCommand(
            {
              workspace: opts.workspace as string | undefined,
              nonInteractive: Boolean(opts.nonInteractive),
              mode: opts.mode as "local" | "remote" | undefined,
              importFrom: opts.importFrom as string | undefined,
              importSource: opts.importSource as string | undefined,
              importSecrets: Boolean(opts.importSecrets),
              remoteUrl: opts.remoteUrl as string | undefined,
              remoteToken: opts.remoteToken as string | undefined,
            },
            defaultRuntime,
          );
          return;
        }
        await setupCommand({ workspace: opts.workspace as string | undefined }, defaultRuntime);
      });
    });
}
