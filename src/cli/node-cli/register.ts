import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";

const NOT_AVAILABLE_MESSAGE = "Node host is not available in this version.";

function stubAction(opts: { json?: boolean }) {
  if (opts.json) {
    defaultRuntime.log(JSON.stringify({ ok: false, error: NOT_AVAILABLE_MESSAGE }));
  } else {
    defaultRuntime.log(NOT_AVAILABLE_MESSAGE);
  }
  process.exitCode = 1;
}

export function registerNodeCli(program: Command) {
  const node = program
    .command("node")
    .description("Run and manage the headless node host service (not available in this version)");

  node
    .command("run")
    .description("Run the headless node host (foreground)")
    .action(() => stubAction({}));

  node
    .command("status")
    .description("Show node host status")
    .option("--json", "Output JSON", false)
    .action((opts) => stubAction(opts));

  node
    .command("install")
    .description("Install the node host service")
    .option("--json", "Output JSON", false)
    .action((opts) => stubAction(opts));

  node
    .command("uninstall")
    .description("Uninstall the node host service")
    .option("--json", "Output JSON", false)
    .action((opts) => stubAction(opts));

  node
    .command("stop")
    .description("Stop the node host service")
    .option("--json", "Output JSON", false)
    .action((opts) => stubAction(opts));

  node
    .command("restart")
    .description("Restart the node host service")
    .option("--json", "Output JSON", false)
    .action((opts) => stubAction(opts));
}
