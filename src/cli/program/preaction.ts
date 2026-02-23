import type { Command } from "commander";
import { setVerbose } from "../../globals.js";
import { isTruthyEnvValue } from "../../infra/env.js";
import type { LogLevel } from "../../logging/levels.js";
import { defaultRuntime } from "../../runtime.js";
import { getCommandPath, getVerboseFlag, hasFlag, hasHelpOrVersion } from "../argv.js";
import { emitCliBanner } from "../banner.js";
import { resolveCliName } from "../cli-name.js";

function setProcessTitleForCommand(actionCommand: Command) {
  let current: Command = actionCommand;
  while (current.parent && current.parent.parent) {
    current = current.parent;
  }
  const name = current.name();
  const cliName = resolveCliName();
  if (!name || name === cliName) {
    return;
  }
  process.title = `${cliName}-${name}`;
}

// Commands that need channel plugins loaded
const PLUGIN_REQUIRED_COMMANDS = new Set([
  "message",
  "channels",
  "directory",
  "agents",
  "configure",
  "onboard",
]);
const JSON_PARSE_ONLY_COMMANDS = new Set(["config set"]);

function getRootCommand(command: Command): Command {
  let current = command;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}

function getCliLogLevel(actionCommand: Command): LogLevel | undefined {
  const root = getRootCommand(actionCommand);
  if (typeof root.getOptionValueSource !== "function") {
    return undefined;
  }
  if (root.getOptionValueSource("logLevel") !== "cli") {
    return undefined;
  }
  const logLevel = root.opts<Record<string, unknown>>().logLevel;
  return typeof logLevel === "string" ? (logLevel as LogLevel) : undefined;
}

function isJsonOutputMode(commandPath: string[], argv: string[]): boolean {
  if (!hasFlag(argv, "--json")) {
    return false;
  }
  const key = `${commandPath[0] ?? ""} ${commandPath[1] ?? ""}`.trim();
  if (JSON_PARSE_ONLY_COMMANDS.has(key)) {
    return false;
  }
  return true;
}

export function registerPreActionHooks(program: Command, programVersion: string) {
  program.hook("preAction", async (_thisCommand, actionCommand) => {
    setProcessTitleForCommand(actionCommand);
    const argv = process.argv;
    if (hasHelpOrVersion(argv)) {
      return;
    }
    const commandPath = getCommandPath(argv, 2);
    const hideBanner =
      isTruthyEnvValue(process.env.REMOTECLAW_HIDE_BANNER) ||
      commandPath[0] === "update" ||
      commandPath[0] === "completion" ||
      (commandPath[0] === "plugins" && commandPath[1] === "update");
    if (!hideBanner) {
      emitCliBanner(programVersion);
    }
    const verbose = getVerboseFlag(argv, { includeDebug: true });
    setVerbose(verbose);
    const cliLogLevel = getCliLogLevel(actionCommand);
    if (cliLogLevel) {
      process.env.REMOTECLAW_LOG_LEVEL = cliLogLevel;
    }
    if (!verbose) {
      process.env.NODE_NO_WARNINGS ??= "1";
    }
    if (commandPath[0] === "doctor" || commandPath[0] === "completion") {
      return;
    }
    const suppressDoctorStdout = isJsonOutputMode(commandPath, argv);
    const { ensureConfigReady } = await import("./config-guard.js");
    await ensureConfigReady({
      runtime: defaultRuntime,
      commandPath,
      ...(suppressDoctorStdout ? { suppressDoctorStdout: true } : {}),
    });
    // Load plugins for commands that need channel access
    if (PLUGIN_REQUIRED_COMMANDS.has(commandPath[0])) {
      const { ensurePluginRegistryLoaded } = await import("../plugin-registry.js");
      ensurePluginRegistryLoaded();
    }
  });
}
