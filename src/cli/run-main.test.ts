import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRemoteClawMigration,
  rewriteUpdateFlagArgv,
  shouldEnsureCliPath,
  shouldRegisterPrimarySubcommand,
  shouldSkipPluginCommandRegistration,
} from "./run-main.js";

describe("rewriteUpdateFlagArgv", () => {
  it("leaves argv unchanged when --update is absent", () => {
    const argv = ["node", "entry.js", "status"];
    expect(rewriteUpdateFlagArgv(argv)).toBe(argv);
  });

  it("rewrites --update into the update command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update"])).toEqual([
      "node",
      "entry.js",
      "update",
    ]);
  });

  it("preserves global flags that appear before --update", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--profile", "p", "--update"])).toEqual([
      "node",
      "entry.js",
      "--profile",
      "p",
      "update",
    ]);
  });

  it("keeps update options after the rewritten command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update", "--json"])).toEqual([
      "node",
      "entry.js",
      "update",
      "--json",
    ]);
  });
});

describe("shouldRegisterPrimarySubcommand", () => {
  it("skips eager primary registration for help/version invocations", () => {
    expect(shouldRegisterPrimarySubcommand(["node", "remoteclaw", "status", "--help"])).toBe(false);
    expect(shouldRegisterPrimarySubcommand(["node", "remoteclaw", "-V"])).toBe(false);
    expect(shouldRegisterPrimarySubcommand(["node", "remoteclaw", "-v"])).toBe(false);
  });

  it("keeps eager primary registration for regular command runs", () => {
    expect(shouldRegisterPrimarySubcommand(["node", "remoteclaw", "status"])).toBe(true);
    expect(shouldRegisterPrimarySubcommand(["node", "remoteclaw", "acp", "-v"])).toBe(true);
  });
});

describe("shouldSkipPluginCommandRegistration", () => {
  it("skips plugin registration for root help/version", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "--help"],
        primary: null,
        hasBuiltinPrimary: false,
      }),
    ).toBe(true);
  });

  it("skips plugin registration for builtin subcommand help", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "config", "--help"],
        primary: "config",
        hasBuiltinPrimary: true,
      }),
    ).toBe(true);
  });

  it("skips plugin registration for builtin command runs", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "sessions", "--json"],
        primary: "sessions",
        hasBuiltinPrimary: true,
      }),
    ).toBe(true);
  });

  it("keeps plugin registration for non-builtin help", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "voicecall", "--help"],
        primary: "voicecall",
        hasBuiltinPrimary: false,
      }),
    ).toBe(false);
  });

  it("keeps plugin registration for non-builtin command runs", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "voicecall", "status"],
        primary: "voicecall",
        hasBuiltinPrimary: false,
      }),
    ).toBe(false);
  });
});

describe("shouldEnsureCliPath", () => {
  it("skips path bootstrap for help/version invocations", () => {
    expect(shouldEnsureCliPath(["node", "remoteclaw", "--help"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "remoteclaw", "-V"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "remoteclaw", "-v"])).toBe(false);
  });

  it("skips path bootstrap for read-only fast paths", () => {
    expect(shouldEnsureCliPath(["node", "remoteclaw", "status"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "remoteclaw", "sessions", "--json"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "remoteclaw", "config", "get", "update"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "remoteclaw", "models", "status", "--json"])).toBe(false);
  });

  it("keeps path bootstrap for mutating or unknown commands", () => {
    expect(shouldEnsureCliPath(["node", "remoteclaw", "message", "send"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "remoteclaw", "voicecall", "status"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "remoteclaw", "acp", "-v"])).toBe(true);
  });
});

describe("checkRemoteClawMigration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns when ~/.openclaw exists but ~/.remoteclaw does not", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (String(p).endsWith("/.remoteclaw")) {
        return false;
      }
      if (String(p).endsWith("/.openclaw")) {
        return true;
      }
      return false;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkRemoteClawMigration({ HOME: "/mock-home" });

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("remoteclaw import ~/.openclaw");
  });

  it("does not warn when ~/.remoteclaw already exists", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkRemoteClawMigration({ HOME: "/mock-home" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn when neither directory exists", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkRemoteClawMigration({ HOME: "/mock-home" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("skips migration check when REMOTECLAW_STATE_DIR is set", () => {
    const existsSpy = vi.spyOn(fs, "existsSync");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkRemoteClawMigration({ HOME: "/mock-home", REMOTECLAW_STATE_DIR: "/custom/state" });

    expect(existsSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
