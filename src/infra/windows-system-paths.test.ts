// Covers %SystemRoot% resolution hardening for pinned Windows system binaries.
import { describe, expect, it } from "vitest";
import {
  resolveWindowsCmdExePath,
  resolveWindowsPowerShellPath,
  resolveWindowsSystem32Path,
  resolveWindowsSystemRoot,
  resolveWindowsWmicPath,
} from "./windows-system-paths.js";

const DEFAULT_ROOT = "C:\\Windows";

// Every test injects its own env object, so the suite is host-platform agnostic.
function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values;
}

describe("resolveWindowsSystemRoot", () => {
  it("accepts a well-formed SystemRoot", () => {
    expect(resolveWindowsSystemRoot(env({ SystemRoot: "D:\\WinNT" }))).toBe("D:\\WinNT");
  });

  it("reads SystemRoot case-insensitively", () => {
    expect(resolveWindowsSystemRoot(env({ SYSTEMROOT: "D:\\WinNT" }))).toBe("D:\\WinNT");
    expect(resolveWindowsSystemRoot(env({ systemroot: "D:\\WinNT" }))).toBe("D:\\WinNT");
  });

  it("falls back to WINDIR, then to the default root", () => {
    expect(resolveWindowsSystemRoot(env({ WINDIR: "E:\\Windows" }))).toBe("E:\\Windows");
    expect(resolveWindowsSystemRoot(env({}))).toBe(DEFAULT_ROOT);
  });

  it("strips trailing separators", () => {
    expect(resolveWindowsSystemRoot(env({ SystemRoot: "D:\\WinNT\\\\" }))).toBe("D:\\WinNT");
    expect(resolveWindowsSystemRoot(env({ SystemRoot: "D:\\WinNT/" }))).toBe("D:\\WinNT");
  });

  // Each rejection branch must fall through to the safe default rather than
  // letting an attacker-shaped value reach a spawn.
  it.each([
    ["NUL byte", "C:\\Win\0dows"],
    ["carriage return", "C:\\Windows\r"],
    ["line feed", "C:\\Windows\n"],
    ["semicolon (PATH separator injection)", "C:\\Windows;C:\\Evil"],
    ["relative path", "Windows"],
    ["dot-relative path", ".\\Windows"],
    ["UNC path", "\\\\attacker\\share\\Windows"],
    ["bare drive root with no subdirectory", "C:\\"],
    ["POSIX absolute path (no drive letter)", "/usr/share/windows"],
    ["empty string", ""],
    ["whitespace only", "   "],
  ])("rejects %s and falls back to the default root", (_label, raw) => {
    expect(resolveWindowsSystemRoot(env({ SystemRoot: raw }))).toBe(DEFAULT_ROOT);
  });

  it("falls through a rejected SystemRoot to a valid WINDIR", () => {
    expect(
      resolveWindowsSystemRoot(env({ SystemRoot: "\\\\evil\\share", WINDIR: "D:\\WinNT" })),
    ).toBe("D:\\WinNT");
  });
});

describe("resolveWindowsSystem32Path", () => {
  it("joins onto System32 with win32 separators", () => {
    expect(resolveWindowsSystem32Path("netstat.exe", env({ SystemRoot: "D:\\WinNT" }))).toBe(
      "D:\\WinNT\\System32\\netstat.exe",
    );
    expect(resolveWindowsSystem32Path("taskkill.exe", env({}))).toBe(
      "C:\\Windows\\System32\\taskkill.exe",
    );
  });

  it.each([
    ["path traversal", "..\\..\\evil.exe"],
    ["forward-slash traversal", "../evil.exe"],
    ["absolute path", "C:\\evil\\payload.exe"],
    ["nested directory", "wbem\\wmic.exe"],
    ["missing .exe suffix", "netstat"],
    ["wrong suffix", "payload.com"],
    ["space in name", "my program.exe"],
    ["empty name", ""],
  ])("rejects %s", (_label, name) => {
    expect(() => resolveWindowsSystem32Path(name, env({}))).toThrow(
      /Invalid Windows System32 executable name/,
    );
  });
});

describe("named binary resolvers", () => {
  it("pins cmd.exe into System32", () => {
    expect(resolveWindowsCmdExePath(env({ SystemRoot: "D:\\WinNT" }))).toBe(
      "D:\\WinNT\\System32\\cmd.exe",
    );
  });

  // PowerShell and WMIC are NOT in System32 directly — a plain System32 join
  // would produce a path that does not exist on any Windows install.
  it("pins powershell.exe under WindowsPowerShell\\v1.0", () => {
    expect(resolveWindowsPowerShellPath(env({ SystemRoot: "D:\\WinNT" }))).toBe(
      "D:\\WinNT\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
  });

  it("pins WMIC.exe under the wbem subdirectory", () => {
    expect(resolveWindowsWmicPath(env({ SystemRoot: "D:\\WinNT" }))).toBe(
      "D:\\WinNT\\System32\\wbem\\WMIC.exe",
    );
  });

  it("keeps a hostile SystemRoot out of every resolved binary path", () => {
    const hostile = env({ SystemRoot: "\\\\attacker\\share" });
    expect(resolveWindowsCmdExePath(hostile)).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(resolveWindowsPowerShellPath(hostile)).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(resolveWindowsWmicPath(hostile)).toBe("C:\\Windows\\System32\\wbem\\WMIC.exe");
  });
});
