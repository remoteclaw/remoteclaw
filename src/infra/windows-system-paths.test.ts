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
    // `path.win32.normalize` collapses `..` BEFORE the shape checks run, so a
    // traversal emerges as a clean absolute drive-rooted non-UNC path that
    // satisfies every other guard. These must be rejected on the raw value.
    ["parent-segment traversal", "C:\\Windows\\..\\Users\\pub\\evil"],
    ["forward-slash traversal", "C:/Windows/../Users/pub/evil"],
    ["mixed-separator traversal", "C:\\Windows/../Users\\pub\\evil"],
    ["traversal landing beside the drive root", "C:\\Windows\\..\\evil"],
    ["traversal clamped at the drive root", "C:\\Windows\\..\\..\\..\\..\\Users"],
    ["traversal with a trailing separator", "C:\\Windows\\..\\Users\\pub\\evil\\"],
    // Not raw-value cases: these two collapse to shapes the pre-existing checks
    // already reject (bare drive root, relative path). They pin that overlap, and
    // would still pass with the raw-value guard removed.
    ["traversal collapsing to the bare drive root", "C:\\Windows\\.."],
    ["leading traversal, which stays relative", "..\\Windows"],
  ])("rejects %s and falls back to the default root", (_label, raw) => {
    expect(resolveWindowsSystemRoot(env({ SystemRoot: raw }))).toBe(DEFAULT_ROOT);
  });

  // The traversal guard matches whole `..` segments, not the substring — dots are
  // legal inside a Windows directory name. The `...` row documents segment-exactness
  // rather than a real-world root: `path.win32.normalize` treats `...` as a literal
  // segment, though Windows itself strips trailing dots so such a directory cannot
  // normally be created.
  it.each([
    ["a directory name containing dots", "C:\\Win..dows", "C:\\Win..dows"],
    ["a trailing-dots directory name", "D:\\WinNT..", "D:\\WinNT.."],
    ["a literal three-dot segment", "C:\\Windows\\...", "C:\\Windows\\..."],
  ])("accepts %s", (_label, raw, expected) => {
    expect(resolveWindowsSystemRoot(env({ SystemRoot: raw }))).toBe(expected);
  });

  it("falls through a rejected SystemRoot to a valid WINDIR", () => {
    expect(
      resolveWindowsSystemRoot(env({ SystemRoot: "\\\\evil\\share", WINDIR: "D:\\WinNT" })),
    ).toBe("D:\\WinNT");
  });

  it("rejects a traversal in WINDIR too, not just SystemRoot", () => {
    expect(resolveWindowsSystemRoot(env({ WINDIR: "C:\\Windows\\..\\Users\\pub\\evil" }))).toBe(
      DEFAULT_ROOT,
    );
  });

  it("falls through a traversal SystemRoot to a valid WINDIR", () => {
    expect(
      resolveWindowsSystemRoot(
        env({ SystemRoot: "C:\\Windows\\..\\Users\\pub\\evil", WINDIR: "D:\\WinNT" }),
      ),
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

  // Every pinned binary is joined onto the one resolved root, so a single bad
  // root redirects all of them at once.
  it.each([
    ["UNC", "\\\\attacker\\share"],
    ["traversal", "C:\\Windows\\..\\Users\\pub\\evil"],
  ])("keeps a hostile %s SystemRoot out of every resolved binary path", (_label, raw) => {
    const hostile = env({ SystemRoot: raw });
    expect(resolveWindowsSystem32Path("netstat.exe", hostile)).toBe(
      "C:\\Windows\\System32\\netstat.exe",
    );
    expect(resolveWindowsCmdExePath(hostile)).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(resolveWindowsPowerShellPath(hostile)).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(resolveWindowsWmicPath(hostile)).toBe("C:\\Windows\\System32\\wbem\\WMIC.exe");
  });
});
