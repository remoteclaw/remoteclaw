import { formatDocsLink } from "../../../packages/terminal-core/src/links.js";
import { theme } from "../../../packages/terminal-core/src/theme.js";
import { getCommandPathWithRootOptions } from "../argv.js";
import { formatCliCommand } from "../command-format.js";

type FormatCliParseErrorOptions = {
  argv?: string[];
};

function stripCommanderErrorPrefix(raw: string): string {
  return raw
    .trim()
    .replace(/^error:\s*/i, "")
    .trim();
}

function quote(value: string): string {
  return `"${value}"`;
}

function resolveHelpCommand(argv: string[] | undefined, options?: { root?: boolean }): string {
  if (options?.root || !argv) {
    return formatCliCommand("remoteclaw --help");
  }
  const commandPath = getCommandPathWithRootOptions(argv, 2);
  if (commandPath.length === 0) {
    return formatCliCommand("remoteclaw --help");
  }
  return formatCliCommand(`remoteclaw ${commandPath.join(" ")} --help`);
}

function lines(...items: Array<string | undefined>): string {
  return `${items.filter((item): item is string => Boolean(item)).join("\n")}\n`;
}

function formatHelpHint(argv: string[] | undefined, options?: { root?: boolean }): string {
  return `${theme.muted("Try:")} ${theme.command(resolveHelpCommand(argv, options))}`;
}

function formatDocsHint(): string {
  return `${theme.muted("Docs:")} ${formatDocsLink("/cli", "docs.remoteclaw.org/cli")}`;
}

export function formatCliParseErrorOutput(
  raw: string,
  options: FormatCliParseErrorOptions = {},
): string {
  const message = stripCommanderErrorPrefix(raw);
  const unknownCommand = message.match(/^unknown command ['"`](.+?)['"`]/i);
  if (unknownCommand) {
    const command = unknownCommand[1] ?? "";
    return lines(
      theme.error(`RemoteClaw does not know the command ${quote(command)}.`),
      formatHelpHint(options.argv, { root: true }),
      `${theme.muted("Plugin command?")} ${theme.command(formatCliCommand("remoteclaw plugins list"))}`,
      formatDocsHint(),
    );
  }

  const unknownOption = message.match(/^unknown option ['"`](.+?)['"`]/i);
  if (unknownOption) {
    const option = unknownOption[1] ?? "";
    return lines(
      theme.error(`RemoteClaw does not recognize option ${quote(option)}.`),
      formatHelpHint(options.argv),
    );
  }

  const missingArgument = message.match(/^missing required argument ['"`](.+?)['"`]/i);
  if (missingArgument) {
    const argument = missingArgument[1] ?? "";
    return lines(
      theme.error(`Missing required argument ${quote(argument)}.`),
      formatHelpHint(options.argv),
    );
  }

  const missingOption = message.match(/^required option ['"`](.+?)['"`] not specified/i);
  if (missingOption) {
    const option = missingOption[1] ?? "";
    return lines(
      theme.error(`Missing required option ${quote(option)}.`),
      formatHelpHint(options.argv),
    );
  }

  if (/^too many arguments\b/i.test(message)) {
    return lines(theme.error("Too many arguments for this command."), formatHelpHint(options.argv));
  }

  return lines(
    theme.error(`RemoteClaw could not parse this command: ${message}`),
    formatHelpHint(options.argv),
  );
}
