import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "help flag",
      argv: ["node", "remoteclaw", "--help"],
      expected: true,
    },
    {
      name: "version flag",
      argv: ["node", "remoteclaw", "-V"],
      expected: true,
    },
    {
      name: "normal command",
      argv: ["node", "remoteclaw", "status"],
      expected: false,
    },
    {
      name: "root -v alias",
      argv: ["node", "remoteclaw", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "remoteclaw", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with log-level",
      argv: ["node", "remoteclaw", "--log-level", "debug", "-v"],
      expected: true,
    },
    {
      name: "subcommand -v should not be treated as version",
      argv: ["node", "remoteclaw", "acp", "-v"],
      expected: false,
    },
    {
      name: "root -v alias with equals profile",
      argv: ["node", "remoteclaw", "--profile=work", "-v"],
      expected: true,
    },
    {
      name: "subcommand path after global root flags should not be treated as version",
      argv: ["node", "remoteclaw", "--dev", "status", "list", "-v"],
      expected: false,
    },
  ])("detects help/version flags: $name", ({ argv, expected }) => {
    expect(hasHelpOrVersion(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "remoteclaw", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "remoteclaw", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "remoteclaw", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPath(argv, 2)).toEqual(expected);
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "remoteclaw", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "remoteclaw"],
      expected: null,
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "remoteclaw", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "remoteclaw", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "remoteclaw", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "remoteclaw", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "remoteclaw", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "remoteclaw", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "remoteclaw", "--", "--timeout=99"],
      expected: undefined,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "remoteclaw", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "remoteclaw", "status", "--debug"])).toBe(false);
    expect(
      getVerboseFlag(["node", "remoteclaw", "status", "--debug"], { includeDebug: true }),
    ).toBe(true);
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "remoteclaw", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "remoteclaw", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "remoteclaw", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "remoteclaw", "status", "--timeout", "nope"],
      expected: undefined,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("builds parse argv from raw args", () => {
    const cases = [
      {
        rawArgs: ["node", "remoteclaw", "status"],
        expected: ["node", "remoteclaw", "status"],
      },
      {
        rawArgs: ["node-22", "remoteclaw", "status"],
        expected: ["node-22", "remoteclaw", "status"],
      },
      {
        rawArgs: ["node-22.2.0.exe", "remoteclaw", "status"],
        expected: ["node-22.2.0.exe", "remoteclaw", "status"],
      },
      {
        rawArgs: ["node-22.2", "remoteclaw", "status"],
        expected: ["node-22.2", "remoteclaw", "status"],
      },
      {
        rawArgs: ["node-22.2.exe", "remoteclaw", "status"],
        expected: ["node-22.2.exe", "remoteclaw", "status"],
      },
      {
        rawArgs: ["/usr/bin/node-22.2.0", "remoteclaw", "status"],
        expected: ["/usr/bin/node-22.2.0", "remoteclaw", "status"],
      },
      {
        rawArgs: ["nodejs", "remoteclaw", "status"],
        expected: ["nodejs", "remoteclaw", "status"],
      },
      {
        rawArgs: ["node-dev", "remoteclaw", "status"],
        expected: ["node", "remoteclaw", "node-dev", "remoteclaw", "status"],
      },
      {
        rawArgs: ["remoteclaw", "status"],
        expected: ["node", "remoteclaw", "status"],
      },
      {
        rawArgs: ["bun", "src/entry.ts", "status"],
        expected: ["bun", "src/entry.ts", "status"],
      },
    ] as const;

    for (const testCase of cases) {
      const parsed = buildParseArgv({
        programName: "remoteclaw",
        rawArgs: [...testCase.rawArgs],
      });
      expect(parsed).toEqual([...testCase.expected]);
    }
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "remoteclaw",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "remoteclaw", "status"]);
  });

  it("decides when to migrate state", () => {
    const nonMutatingArgv = [
      ["node", "remoteclaw", "status"],
      ["node", "remoteclaw", "health"],
      ["node", "remoteclaw", "sessions"],
      ["node", "remoteclaw", "config", "get", "update"],
      ["node", "remoteclaw", "config", "unset", "update"],
      ["node", "remoteclaw", "models", "list"],
      ["node", "remoteclaw", "models", "status"],
      ["node", "remoteclaw", "memory", "status"],
      ["node", "remoteclaw", "agent", "--message", "hi"],
    ] as const;
    const mutatingArgv = [
      ["node", "remoteclaw", "agents", "list"],
      ["node", "remoteclaw", "message", "send"],
    ] as const;

    for (const argv of nonMutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(false);
    }
    for (const argv of mutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(true);
    }
  });

  it.each([
    { path: ["status"], expected: false },
    { path: ["config", "get"], expected: false },
    { path: ["models", "status"], expected: false },
    { path: ["agents", "list"], expected: true },
  ])("reuses command path for migrate state decisions: $path", ({ path, expected }) => {
    expect(shouldMigrateStateFromPath(path)).toBe(expected);
  });
});
