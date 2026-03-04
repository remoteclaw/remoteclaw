import type { Command } from "commander";
import { importCommand } from "../../commands/import.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerImportCommand(program: Command) {
  program
    .command("import <path>")
    .description("Import an existing RemoteClaw installation into RemoteClaw")
    .option("--yes", "Skip confirmation prompts", false)
    .option("--dry-run", "Preview import without writing files", false)
    .option("--non-interactive", "Run without prompts (requires --yes if target exists)", false)
    .action(async (sourcePath: string, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await importCommand(
          {
            sourcePath,
            yes: Boolean(opts.yes),
            dryRun: Boolean(opts.dryRun),
            nonInteractive: Boolean(opts.nonInteractive),
          },
          defaultRuntime,
        );
        defaultRuntime.exit(0);
      });
    });
}
