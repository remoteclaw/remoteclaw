// Pins WHICH resolver every Windows spawn site picks, by the absolute path it produces.
//
// `windows-system-paths.test.ts` proves each resolver returns the right path.
// Nothing proved that each *call site selects the right resolver*, and that is the
// load-bearing half: two pinned binaries do not live in `System32` proper.
//
//   powershell.exe -> %SystemRoot%\System32\WindowsPowerShell\v1.0\
//   WMIC.exe       -> %SystemRoot%\System32\wbem\
//   everything else-> %SystemRoot%\System32\
//
// So swapping `resolveWindowsWmicPath()` for `resolveWindowsSystem32Path("wmic.exe")`
// at a call site keeps the basename `wmic.exe`, keeps every basename-level assertion
// green, and yields `C:\Windows\System32\wmic.exe` — a path that exists on no Windows
// install. This suite fails on exactly that swap (#3092).
//
// Why a source scan rather than 28 behavioural harnesses: no workflow runs a Windows
// runner (`git grep -l "windows-latest" .github/workflows/` is empty), most of these
// sites sit behind `process.platform === "win32"` guards deep in daemon/clipboard/
// encoding paths, and the property under test is a *static* binary->resolver mapping.
// The sites that DO have argv capture are additionally pinned behaviourally — see
// `ports.test.ts` (all five ports-inspect sites) and `exec.windows.test.ts`.
//
// Known limit: this reads source text, so an indirection (`const r = resolveWindowsWmicPath`)
// would not be classified as a call. `rejects an aliased resolver reference` below closes
// that specific hole by requiring every mention of a resolver identifier, outside its
// import statement, to be a direct call.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveWindowsCmdExePath,
  resolveWindowsPowerShellPath,
  resolveWindowsSystem32Path,
  resolveWindowsWmicPath,
} from "./windows-system-paths.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = path.join(repoRoot, "src");

// A non-default root, so an expected literal below cannot be satisfied by the
// `C:\Windows` fallback — the resolution has to actually read SystemRoot.
const TEST_ENV: NodeJS.ProcessEnv = { SystemRoot: "D:\\WinNT" };

const SYSTEM32 = "D:\\WinNT\\System32";
const CMD_EXE = `${SYSTEM32}\\cmd.exe`;
const POWERSHELL = `${SYSTEM32}\\WindowsPowerShell\\v1.0\\powershell.exe`;
const WMIC = `${SYSTEM32}\\wbem\\WMIC.exe`;

// The expected inventory. Written as LITERAL paths on purpose: deriving them by
// calling the resolvers would restate the implementation and assert nothing (the
// failure mode #3092 catalogued at `exec.windows.test.ts`).
//
// Per file, in source order. Adding, removing or re-pointing a pinned spawn site
// fails here until this table is updated — which is the point: the update is where
// somebody has to state, in a reviewable diff, which absolute path now gets spawned.
const EXPECTED_CALL_SITES: Readonly<Record<string, readonly string[]>> = {
  "src/agents/date-time.ts": [POWERSHELL],
  "src/cli/ports.ts": [`${SYSTEM32}\\netstat.exe`],
  "src/cli/update-cli/restart-helper.ts": [CMD_EXE],
  "src/commands/onboard-helpers.ts": [`${SYSTEM32}\\rundll32.exe`, `${SYSTEM32}\\where.exe`],
  "src/daemon/launchd.ts": [CMD_EXE],
  "src/daemon/program-args.ts": [`${SYSTEM32}\\where.exe`],
  "src/daemon/schtasks-exec.ts": [`${SYSTEM32}\\schtasks.exe`],
  "src/daemon/schtasks.ts": [CMD_EXE, `${SYSTEM32}\\taskkill.exe`],
  "src/infra/clipboard.ts": [`${SYSTEM32}\\clip.exe`, POWERSHELL],
  "src/infra/node-shell.ts": [CMD_EXE],
  "src/infra/ports-inspect.ts": [
    `${SYSTEM32}\\tasklist.exe`,
    POWERSHELL,
    WMIC,
    `${SYSTEM32}\\netstat.exe`,
    `${SYSTEM32}\\netstat.exe`,
  ],
  "src/infra/windows-encoding.ts": [CMD_EXE, POWERSHELL],
  "src/infra/windows-port-pids.ts": [POWERSHELL, `${SYSTEM32}\\netstat.exe`, POWERSHELL, WMIC],
  "src/infra/windows-task-restart.ts": [CMD_EXE],
  "src/node-host/invoke-system-run.ts": [CMD_EXE],
  "src/process/exec.ts": [CMD_EXE],
  "src/process/kill-tree.ts": [`${SYSTEM32}\\taskkill.exe`],
};

// #3088 pinned 27 executable-position sites; #3099 added the 28th — the `rundll32.exe`
// in `onboard-helpers.ts`, which replaced a `cmd /c start` that re-parsed the URL through
// the shell. Stated independently of the table above so a merge that drops rows cannot
// quietly shrink the covered surface.
const EXPECTED_CALL_SITE_COUNT = 28;

const RESOLVER_NAMES = [
  "resolveWindowsSystem32Path",
  "resolveWindowsCmdExePath",
  "resolveWindowsPowerShellPath",
  "resolveWindowsWmicPath",
] as const;

// Ordered so `resolveWindowsSystem32Path` (which takes the executable name) is
// distinguishable from the fixed-target resolvers.
const CALL_RE =
  /\bresolveWindows(?:(System32Path)\(\s*"([^"]*)"|(CmdExePath)\(|(PowerShellPath)\(|(WmicPath)\()/gu;

/** Drop comments so a commented-out call, or a resolver named in prose, is not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

/** Drop the `windows-system-paths` import so its identifiers are not read as calls. */
function stripResolverImport(source: string): string {
  return source.replace(
    /import\s*(?:type\s+)?\{[^}]*\}\s*from\s*"[^"]*windows-system-paths\.js";/gu,
    " ",
  );
}

function listProductionSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listProductionSources(abs));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }
    // Tests and their helpers legitimately reference the resolvers in expectations.
    if (/\.(?:test|spec|d)\.ts$/u.test(entry.name) || entry.name.endsWith("test-support.ts")) {
      continue;
    }
    found.push(abs);
  }
  return found;
}

/** Resolve the absolute path a single scanned call site produces. */
function resolveScannedCall(match: RegExpExecArray): string {
  const [, system32, executableName, cmdExe, powerShell] = match;
  if (system32) {
    return resolveWindowsSystem32Path(executableName ?? "", TEST_ENV);
  }
  if (cmdExe) {
    return resolveWindowsCmdExePath(TEST_ENV);
  }
  if (powerShell) {
    return resolveWindowsPowerShellPath(TEST_ENV);
  }
  return resolveWindowsWmicPath(TEST_ENV);
}

type ScannedFile = { relPath: string; code: string; paths: string[] };

/**
 * Every production file that so much as MENTIONS a resolver, including files whose
 * mentions are all indirect. Keeping zero-call files in is what lets the alias check
 * below see them at all — dropping them here is how an aliased site would slip past
 * its own guard.
 */
function scanResolverMentions(): ScannedFile[] {
  const scanned: ScannedFile[] = [];
  for (const abs of listProductionSources(srcRoot)) {
    const relPath = path.relative(repoRoot, abs).split(path.sep).join("/");
    // The resolver module defines and internally composes these; it is not a call site.
    if (relPath === "src/infra/windows-system-paths.ts") {
      continue;
    }
    const code = stripResolverImport(stripComments(readFileSync(abs, "utf-8")));
    if (!RESOLVER_NAMES.some((name) => new RegExp(`\\b${name}\\b`, "u").test(code))) {
      continue;
    }
    const paths = [...code.matchAll(CALL_RE)].map((match) => resolveScannedCall(match));
    scanned.push({ relPath, code, paths });
  }
  return scanned.toSorted((left, right) => left.relPath.localeCompare(right.relPath));
}

const mentioningFiles = scanResolverMentions();
const scannedFiles = mentioningFiles.filter((file) => file.paths.length > 0);

describe("windows system-path call sites", () => {
  it("pins the absolute path every production call site resolves to", () => {
    const actual = Object.fromEntries(scannedFiles.map((file) => [file.relPath, file.paths]));
    expect(actual).toEqual(EXPECTED_CALL_SITES);
  });

  it("covers every pinned spawn site", () => {
    const scannedCount = scannedFiles.reduce((total, file) => total + file.paths.length, 0);
    expect(scannedCount).toBe(EXPECTED_CALL_SITE_COUNT);
    expect(Object.values(EXPECTED_CALL_SITES).flat()).toHaveLength(EXPECTED_CALL_SITE_COUNT);
  });

  // The two ways a real spawn site could exist without the table above ever seeing it.
  // Both would otherwise show up only as a quietly shorter inventory.
  it("classifies every resolver reference as a direct, literal-named call", () => {
    for (const file of mentioningFiles) {
      let directCalls = 0;
      for (const name of RESOLVER_NAMES) {
        const mentions = file.code.match(new RegExp(`\\b${name}\\b`, "gu"))?.length ?? 0;
        const calls = file.code.match(new RegExp(`\\b${name}\\s*\\(`, "gu"))?.length ?? 0;
        expect(
          calls,
          `${file.relPath}: ${name} is referenced ${mentions}x but called ${calls}x — an aliased reference is a spawn site this suite cannot see`,
        ).toBe(mentions);
        directCalls += calls;
      }
      expect(
        file.paths.length,
        `${file.relPath}: ${directCalls} resolver call(s) but ${file.paths.length} classified — a computed executable name (rather than a string literal) escapes the inventory`,
      ).toBe(directCalls);
    }
  });

  // The two non-System32 binaries are the whole reason a basename assertion is not
  // enough, so state their parent directories outright rather than only via the table.
  it("keeps powershell.exe and WMIC.exe out of System32 proper", () => {
    const parents = new Map<string, string>();
    for (const file of scannedFiles) {
      for (const resolved of file.paths) {
        parents.set(path.win32.basename(resolved).toLowerCase(), path.win32.dirname(resolved));
      }
    }
    expect(parents.get("powershell.exe")).toBe(`${SYSTEM32}\\WindowsPowerShell\\v1.0`);
    expect(parents.get("wmic.exe")).toBe(`${SYSTEM32}\\wbem`);
    expect(parents.get("cmd.exe")).toBe(SYSTEM32);
    expect(parents.get("netstat.exe")).toBe(SYSTEM32);
  });
});
