// Reparse support for lazy commands after their placeholder has been replaced.
import type { Command } from "commander";
import { buildParseArgv } from "../argv.js";
import { resolveActionArgs, resolveCommandOptionArgs } from "./helpers.js";

function getCommandPathFromRoot(command: Command | undefined): string[] {
  const path: string[] = [];
  let current = command;
  while (current?.parent) {
    const name = current.name();
    if (name) {
      path.unshift(name);
    }
    current = current.parent;
  }
  return path;
}

function buildFallbackArgv(program: Command, actionCommand: Command | undefined): string[] {
  const actionArgsList = resolveActionArgs(actionCommand);
  const parentOptionArgs =
    actionCommand?.parent === program ? resolveCommandOptionArgs(program) : [];
  const commandPath = getCommandPathFromRoot(actionCommand);
  if (commandPath.length === 0) {
    return [...parentOptionArgs, ...actionArgsList];
  }
  return [
    ...commandPath.slice(0, -1),
    ...parentOptionArgs,
    commandPath[commandPath.length - 1],
    ...actionArgsList,
  ];
}

/** Rebuild argv from Commander action args and re-run parsing after lazy registration. */
export async function reparseProgramFromActionArgs(
  program: Command,
  actionArgs: unknown[],
): Promise<void> {
  const actionCommand = actionArgs.at(-1) as Command | undefined;
  const root = actionCommand?.parent ?? program;
  const rawArgs = (root as Command & { rawArgs?: string[] }).rawArgs;
  const fallbackArgv = buildFallbackArgv(program, actionCommand);
  const parseArgv = buildParseArgv({
    programName: program.name(),
    rawArgs,
    fallbackArgv,
  });
  await program.parseAsync(parseArgv);
}
