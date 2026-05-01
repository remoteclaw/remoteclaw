import type { Command } from "commander";
import { danger } from "../globals.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { browserCoreExamples } from "./browser-cli-examples.js";
import { registerBrowserExtensionCommands } from "./browser-cli-extension.js";
import { registerBrowserManageCommands } from "./browser-cli-manage.js";
import type { BrowserParentOpts } from "./browser-cli-shared.js";
import { formatCliCommand } from "./command-format.js";
import { addGatewayClientOptions } from "./gateway-rpc.js";
import { formatHelpExamples } from "./help-format.js";

export function registerBrowserCli(program: Command) {
  const browser = program
    .command("browser")
    .description("Manage RemoteClaw's CDP browser bridge")
    .option("--browser-profile <name>", "Browser profile name (default from config)")
    .option("--json", "Output machine-readable JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples(
          browserCoreExamples.map((cmd) => [cmd, ""]),
          true,
        )}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/browser", "docs.remoteclaw.org/cli/browser")}\n`,
    )
    .action(() => {
      browser.outputHelp();
      defaultRuntime.error(danger(`Missing subcommand. Try: "${formatCliCommand("remoteclaw browser status")}"`));
      defaultRuntime.exit(1);
    });

  addGatewayClientOptions(browser);

  const parentOpts = (cmd: Command) => cmd.parent?.opts?.() as BrowserParentOpts;

  registerBrowserManageCommands(browser, parentOpts);
  registerBrowserExtensionCommands(browser, parentOpts);
}
