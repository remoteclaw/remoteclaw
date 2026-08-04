// Covers %SystemRoot% resolution hardening for pinned Windows system binaries.
import { describe, expect, it } from "vitest";
import {
  formatRejectedWindowsShellOverride,
  resolveWindowsCmdExePath,
  resolveWindowsPowerShellPath,
  resolveWindowsSystem32Path,
  resolveWindowsSystemRoot,
  resolveWindowsWmicPath,
  selectWindowsShellPath,
} from "./windows-system-paths.js";

const DEFAULT_ROOT = "C:\\Windows";

// Every test injects its own env object, so the suite is host-platform agnostic.
function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values;
}

// One table, deliberately shared by the `%SystemRoot%` and `%ComSpec%` suites below.
// #3100 existed because those two inputs had different amounts of validation; running
// both against the SAME rows is what makes "one shared predicate" a checked claim rather
// than a code-review observation. A second copy of this table would re-open the gap.
const HOSTILE_PATH_SHAPES: readonly (readonly [string, string])[] = [
  ["NUL byte", "C:\\Win\0dows"],
  // Embedded, not trailing. A TRAILING CR/LF is removed by the leading `.trim()` and the
  // value is then accepted — see the "trims" rows in the accept table below. The rows here
  // used to be `"C:\\Windows\r"`, which asserted nothing: it trims to `C:\Windows`, which
  // IS the default root, so the expectation held whether or not the guard ran.
  ["embedded carriage return", "C:\\Win\rdows"],
  ["embedded line feed", "C:\\Win\ndows"],
  ["carriage return before a forged second value", "C:\\Windows\r\nC:\\Evil"],
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
] as const;

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
  it.each(HOSTILE_PATH_SHAPES)("rejects %s and falls back to the default root", (_label, raw) => {
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
    // Trailing control characters are whitespace to `.trim()`, so the value that reaches
    // the shape checks — and the spawn — is already clean. Recorded as an ACCEPT with the
    // trimmed result rather than mislabelled as a rejection.
    ["a trailing carriage return, trimmed away", "D:\\WinNT\r", "D:\\WinNT"],
    ["a trailing line feed, trimmed away", "D:\\WinNT\n", "D:\\WinNT"],
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

// The shell selector is the one input the pinning workstream left unvalidated: the
// expression it replaces was `process.env.ComSpec ?? resolveWindowsCmdExePath()`, and `??`
// falls through only on null/undefined — so ANY set value won, however shaped (#3100).
describe("selectWindowsShellPath", () => {
  const PINNED = "D:\\WinNT\\System32\\cmd.exe";
  const ROOT = { SystemRoot: "D:\\WinNT" };

  it("honours a well-formed ComSpec", () => {
    const override = "E:\\CustomWindows\\System32\\cmd.exe";
    // Guard: the two branches must be distinguishable, else nothing below is asserted.
    expect(override).not.toBe(PINNED);
    expect(selectWindowsShellPath(env({ ...ROOT, ComSpec: override }))).toEqual({
      path: override,
    });
  });

  it("reads ComSpec case-insensitively, as Windows does", () => {
    const override = "E:\\CustomWindows\\System32\\cmd.exe";
    expect(selectWindowsShellPath(env({ ...ROOT, COMSPEC: override })).path).toBe(override);
    expect(selectWindowsShellPath(env({ ...ROOT, comspec: override })).path).toBe(override);
  });

  it("pins when ComSpec is unset, and reports no refusal", () => {
    expect(selectWindowsShellPath(env(ROOT))).toEqual({ path: PINNED });
  });

  // A blank ComSpec is "no override", not an operator mistake worth shouting about.
  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
  ])("pins a %s ComSpec without reporting a refusal", (_label, raw) => {
    expect(selectWindowsShellPath(env({ ...ROOT, ComSpec: raw }))).toEqual({ path: PINNED });
  });

  // The point of the change: every shape `%SystemRoot%` rejects, `%ComSpec%` now rejects
  // too. Reusing HOSTILE_PATH_SHAPES is what proves the predicate is genuinely shared —
  // if the two ever diverge, a row here fails without anyone having to notice by eye.
  it.each(HOSTILE_PATH_SHAPES)("refuses %s and falls back to the pinned cmd.exe", (_label, raw) => {
    const selection = selectWindowsShellPath(env({ ...ROOT, ComSpec: raw }));
    expect(selection.path).toBe(PINNED);
    // Blank values are "unset", not refusals — they are covered by the case above.
    if (raw.trim()) {
      expect(selection.rejectedComSpec).toBe(raw);
    }
  });

  // The three shapes #3100 called out by name, asserted as literals so the failure
  // message names the attack rather than a table index.
  it("refuses a traversal ComSpec", () => {
    expect(
      selectWindowsShellPath(env({ ...ROOT, ComSpec: "C:\\Windows\\..\\Users\\pub\\evil.exe" }))
        .path,
    ).toBe(PINNED);
  });

  it("refuses a UNC ComSpec so a remote share cannot supply the shell", () => {
    expect(
      selectWindowsShellPath(env({ ...ROOT, ComSpec: "\\\\attacker\\share\\cmd.exe" })).path,
    ).toBe(PINNED);
  });

  it("refuses a ComSpec carrying an embedded PATH separator", () => {
    expect(
      selectWindowsShellPath(
        env({ ...ROOT, ComSpec: "C:\\Windows\\System32\\cmd.exe;C:\\Evil\\cmd.exe" }),
      ).path,
    ).toBe(PINNED);
  });

  // Honest boundary: a shape gate equalizes ComSpec with SystemRoot, it does not make an
  // attacker-controlled environment block safe. Stated as a test so the limit is recorded
  // where someone reading the guard will see it, not only in a PR description.
  it("still accepts a well-formed path to an arbitrary executable", () => {
    const planted = "C:\\Users\\Public\\evil.exe";
    expect(selectWindowsShellPath(env({ ...ROOT, ComSpec: planted }))).toEqual({ path: planted });
  });

  it("explains the refusal with both the refused value and the fallback", () => {
    // A backslash-free refused value keeps this expectation readable: the message renders
    // the value JSON-escaped, so a Windows path would have to be written with doubled
    // backslashes here and would restate the implementation rather than assert it.
    const selection = selectWindowsShellPath(env({ ...ROOT, ComSpec: "/usr/share/windows" }));
    const message = formatRejectedWindowsShellOverride(selection);
    expect(message).toContain("/usr/share/windows");
    expect(message).toContain(PINNED);
  });

  // The refused value is attacker-shaped by definition and is about to be written to a
  // log, where a raw CR/LF would forge a second log line.
  it("neutralizes control characters in the refused value", () => {
    const message = formatRejectedWindowsShellOverride(
      selectWindowsShellPath(env({ ...ROOT, ComSpec: "C:\\Win\r\nFORGED LOG LINE" })),
    );
    expect(message).not.toContain("\r");
    expect(message).not.toContain("\n");
    expect(message).toContain("FORGED LOG LINE");
  });
});
