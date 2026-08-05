// Deliberately does NOT mock `node:child_process`. The bug this module exists to fix
// was "the command we spawn does not exist on this OS" — a mocked `execFileSync` reports
// success for a command name that could never run, which is exactly the shape of test
// that let the defect ship. So the branch selection is asserted against LITERAL paths
// (never by re-calling the resolver, which would restate the implementation), and the
// selector is then exercised for real against the host's actual PATH.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { resolvePathLookupCommand } from "./path-lookup.js";

// A non-default SystemRoot, so a passing Windows assertion cannot be satisfied by the
// `C:\Windows` fallback — the resolution has to actually read the env.
const WINDOWS_ENV: NodeJS.ProcessEnv = { SystemRoot: "D:\\WinNT" };

describe("resolvePathLookupCommand", () => {
  it("uses `which` on POSIX platforms", () => {
    expect(resolvePathLookupCommand("linux", WINDOWS_ENV)).toBe("which");
    expect(resolvePathLookupCommand("darwin", WINDOWS_ENV)).toBe("which");
    expect(resolvePathLookupCommand("freebsd", WINDOWS_ENV)).toBe("which");
  });

  it("uses a SystemRoot-pinned where.exe on win32", () => {
    expect(resolvePathLookupCommand("win32", WINDOWS_ENV)).toBe("D:\\WinNT\\System32\\where.exe");
  });

  it("does not spawn `where` by bare name on win32", () => {
    // The CWE-426 half of the fix: a bare `where` would let %PATH% — and, under some
    // configurations, the CWD — decide which executable runs. Absolute, or it is not a fix.
    const resolved = resolvePathLookupCommand("win32", WINDOWS_ENV);
    expect(resolved).not.toBe("where");
    expect(resolved).not.toBe("where.exe");
    expect(resolved.startsWith("D:\\WinNT\\")).toBe(true);
  });

  it("falls back to C:\\Windows when SystemRoot is unusable on win32", () => {
    expect(resolvePathLookupCommand("win32", {})).toBe("C:\\Windows\\System32\\where.exe");
    expect(resolvePathLookupCommand("win32", { SystemRoot: "..\\relative" })).toBe(
      "C:\\Windows\\System32\\where.exe",
    );
  });

  it("defaults to the running platform", () => {
    const expected = process.platform === "win32" ? "where.exe" : "which";
    expect(resolvePathLookupCommand().endsWith(expected)).toBe(true);
  });

  // ── Real lookups on the host that is running this suite ───────────────────
  //
  // These are the assertions that fail on a Windows runner if the branch is wrong:
  // spawning `which` there throws ENOENT, so "finds a binary that exists" fails and
  // "rejects a binary that does not exist" passes for the wrong reason. Both
  // directions are asserted so a command that always throws cannot look correct.
  //
  // Precondition: `node` is on PATH. Every lane already relies on this — the CI
  // setup action runs `which node` before installing, and vitest itself is spawned
  // through it.
  describe("against the real host PATH", () => {
    const lookup = (binary: string) =>
      execFileSync(resolvePathLookupCommand(), [binary], { stdio: "ignore" });

    it("exits zero for a binary that is on PATH", () => {
      expect(() => lookup("node")).not.toThrow();
    });

    it("throws for a binary that is not on PATH", () => {
      expect(() => lookup("remoteclaw-binary-that-does-not-exist-8f21c4")).toThrow();
    });
  });
});
