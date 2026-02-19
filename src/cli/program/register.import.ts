import type { Command } from "commander";
import { importCommand } from "../../commands/import.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerImportCommand(program: Command) {
  program
    .command("import")
    .description("Import an OpenClaw config directory into RemoteClaw format")
    .argument("<path>", "Path to the OpenClaw config directory (e.g. ~/.openclaw)")
    .option("--dry-run", "Print the import report without writing any files", false)
    .option("--overwrite", "Replace existing remoteclaw.json entirely", false)
    .option(
      "--merge",
      "Merge into existing config; existing RemoteClaw values win on conflict",
      false,
    )
    .action(async (sourcePath: string, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await importCommand(
          sourcePath,
          {
            dryRun: Boolean(opts.dryRun),
            overwrite: Boolean(opts.overwrite),
            merge: Boolean(opts.merge),
          },
          defaultRuntime,
        );
      });
    });
}
