// Covers platform shell argv construction.
import { describe, expect, it } from "vitest";
import { buildNodeShellCommand } from "./node-shell.js";
import { resolveWindowsCmdExePath } from "./windows-system-paths.js";

describe("buildNodeShellCommand", () => {
  it("uses a %SystemRoot%-pinned cmd.exe for win-prefixed platform labels", () => {
    const cmdExe = resolveWindowsCmdExePath();
    expect(cmdExe).toMatch(/^[A-Za-z]:\\.*\\System32\\cmd\.exe$/);
    expect(buildNodeShellCommand("echo hi", "win32")).toEqual([
      cmdExe,
      "/d",
      "/s",
      "/c",
      "echo hi",
    ]);
    expect(buildNodeShellCommand("echo hi", "windows")).toEqual([
      cmdExe,
      "/d",
      "/s",
      "/c",
      "echo hi",
    ]);
    expect(buildNodeShellCommand("echo hi", " Windows 11 ")).toEqual([
      cmdExe,
      "/d",
      "/s",
      "/c",
      "echo hi",
    ]);
  });

  it("uses /bin/sh for non-windows and missing platform values", () => {
    expect(buildNodeShellCommand("echo hi", "darwin")).toEqual(["/bin/sh", "-lc", "echo hi"]);
    expect(buildNodeShellCommand("echo hi", "linux")).toEqual(["/bin/sh", "-lc", "echo hi"]);
    expect(buildNodeShellCommand("echo hi")).toEqual(["/bin/sh", "-lc", "echo hi"]);
    expect(buildNodeShellCommand("echo hi", null)).toEqual(["/bin/sh", "-lc", "echo hi"]);
    expect(buildNodeShellCommand("echo hi", "   ")).toEqual(["/bin/sh", "-lc", "echo hi"]);
  });
});
