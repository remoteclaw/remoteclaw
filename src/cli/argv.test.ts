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
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "remoteclaw", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "remoteclaw", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "remoteclaw", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "remoteclaw", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "remoteclaw", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "remoteclaw", "status", "--", "ignored"], 2)).toEqual([
      "status",
    ]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "remoteclaw", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "remoteclaw"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "remoteclaw", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "remoteclaw", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "remoteclaw", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "remoteclaw", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "remoteclaw", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "remoteclaw", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "remoteclaw", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "remoteclaw", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "remoteclaw", "status", "--debug"])).toBe(false);
    expect(
      getVerboseFlag(["node", "remoteclaw", "status", "--debug"], { includeDebug: true }),
    ).toBe(true);
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "remoteclaw", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "remoteclaw", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "remoteclaw", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "remoteclaw", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["node", "remoteclaw", "status"],
    });
    expect(nodeArgv).toEqual(["node", "remoteclaw", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["node-22", "remoteclaw", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "remoteclaw", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["node-22.2.0.exe", "remoteclaw", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "remoteclaw", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["node-22.2", "remoteclaw", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "remoteclaw", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["node-22.2.exe", "remoteclaw", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "remoteclaw", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["/usr/bin/node-22.2.0", "remoteclaw", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "remoteclaw", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["nodejs", "remoteclaw", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "remoteclaw", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["node-dev", "remoteclaw", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual([
      "node",
      "remoteclaw",
      "node-dev",
      "remoteclaw",
      "status",
    ]);

    const directArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["remoteclaw", "status"],
    });
    expect(directArgv).toEqual(["node", "remoteclaw", "status"]);

    const bunArgv = buildParseArgv({
      programName: "remoteclaw",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "remoteclaw",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "remoteclaw", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "remoteclaw", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "config", "get", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "config", "unset", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "models", "list"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "models", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "remoteclaw", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "remoteclaw", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["config", "get"])).toBe(false);
    expect(shouldMigrateStateFromPath(["models", "status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
