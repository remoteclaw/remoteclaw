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
  selectWindowsShellPath,
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
  // The schtasks.exe entry is interpolated into emitted PowerShell, not spawned as argv
  // from this module — see `selectWindowsShellPath` note below on emitted-script pinning.
  "src/cli/update-cli/restart-helper.ts": [`${SYSTEM32}\\schtasks.exe`, CMD_EXE],
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
  // The schtasks.exe entry is the runner path carried into the emitted handoff script.
  "src/infra/update-managed-service-handoff.ts": [`${SYSTEM32}\\schtasks.exe`],
  "src/infra/windows-encoding.ts": [CMD_EXE, POWERSHELL],
  "src/infra/windows-port-pids.ts": [POWERSHELL, `${SYSTEM32}\\netstat.exe`, POWERSHELL, WMIC],
  // The schtasks.exe entry is interpolated into the emitted `.cmd` (both the /Query probe
  // and the /Run retry), not spawned as argv from this module. CMD_EXE is the argv spawn of
  // that script. Other binary names ALSO inside that emitted script are still bare — the
  // scope note below enumerates them. Deliberately not re-listed here: this row carried its
  // own copy of that set and the copy went stale, which is the defect the note now warns about.
  "src/infra/windows-task-restart.ts": [`${SYSTEM32}\\schtasks.exe`, CMD_EXE],
  "src/node-host/invoke-system-run.ts": [CMD_EXE],
  "src/process/exec.ts": [CMD_EXE],
  "src/process/kill-tree.ts": [`${SYSTEM32}\\taskkill.exe`],
  "src/security/windows-acl.ts": [
    `${SYSTEM32}\\whoami.exe`,
    `${SYSTEM32}\\icacls.exe`,
    `${SYSTEM32}\\icacls.exe`,
  ],
};

// #3088 pinned 27 executable-position sites; #3099 added the 28th — the `rundll32.exe`
// in `onboard-helpers.ts`, which replaced a `cmd /c start` that re-parsed the URL through
// the shell. #3112 added five more: `windows-acl.ts` had a third, unhardened copy of the
// resolver (whoami + icacls) plus a bare `icacls` on the ACL-reset path, and `schtasks`
// named inside *emitted script content* — the detached update handoff and the update
// restart helper's PowerShell — was pinned at emission time. #3116 added the 34th, the
// `schtasks` pair inside the scheduled-task restart `.cmd`, which #3112 §4 named alongside
// the other two and the first pass left bare.
//
// SCOPE — what a green run here does and does NOT establish. Covered:
//   - every argv-position spawn of a Windows system binary under `src/`;
//   - the `schtasks` invocations inside emitted script content that #3112 §4 NAMED.
// NOT covered: bare binaries inside emitted script content generally. Known-bare today,
// deliberately out of scope, and invisible to this suite because it scans for resolver
// CALLS rather than for binary names in emitted strings:
//   - `cli/update-cli/restart-helper.ts:193` — `powershell -NoProfile …` (`.cmd` header)
//   - `cli/update-cli/restart-helper.ts:306` — `& netstat.exe -ano -p tcp` (PowerShell body)
//   - `infra/windows-task-restart.ts:52`     — `timeout /t … /nobreak` (in the `:retry` loop)
//   - `infra/windows-task-restart.ts:55`     — `powershell.exe …` and `findstr` (`.cmd`)
//   - `infra/windows-task-restart.ts:66`     — `start "" /min cmd.exe /d /c …` (fallback)
//   - `daemon/schtasks.ts:372`               — `start "" /min cmd.exe /d /c …` (login item)
// `timeout` is the one most easily skipped: it reads like a `cmd.exe` builtin and is not one.
// It is `%SystemRoot%\System32\timeout.exe`, and it sits BETWEEN the two `schtasks` lines
// #3116 pinned — same emitted script, same inherited-cwd-then-%PATH% resolution. Line numbers
// above are a finding aid, not a pin; nothing re-checks them.
//
// So this is an inventory of a covered surface, not a closed class — and the bullets are an
// inventory of what is KNOWN bare at time of writing, not a proof the set is complete. Nothing
// in CI scans emitted script content for binary names, so a binary added to an emitted script
// later joins that set without failing anything here. Do not read this as "emitted scripts are
// fully pinned", and do not read pinning these six as closing the class.
//
// One more limit worth knowing before trusting a green run: this suite scans for resolver
// CALLS, so for an emitted-script row it proves the parent RESOLVES the path — not that the
// emitted text still USES it. Reverting an emitted `${quotedSchtasksPath}` to a bare name
// while leaving the call in place passes here; only the behavioural suite next to each
// emitter (`windows-task-restart.test.ts`, `restart-helper.test.ts`) fails on that. Verified
// by mutation, not assumed.
//
// The count is stated independently of the table above so a merge that drops rows cannot
// quietly shrink the covered surface.
const EXPECTED_CALL_SITE_COUNT = 34;

// `selectWindowsShellPath` is the fifth name because #3100 moved the `%ComSpec%` decision
// behind it: `exec.ts` and `launchd.ts` used to call `resolveWindowsCmdExePath` directly as
// the right-hand side of a `??`, which honoured a set-but-hostile ComSpec unchecked. Listing
// it here is what keeps both of those spawn sites in the inventory rather than dropping them
// as "no resolver mentioned" — the failure mode #3112 named for unscanned files.
const RESOLVER_NAMES = [
  "resolveWindowsSystem32Path",
  "resolveWindowsCmdExePath",
  "resolveWindowsPowerShellPath",
  "resolveWindowsWmicPath",
  "selectWindowsShellPath",
] as const;

// Ordered so `resolveWindowsSystem32Path` (which takes the executable name) is
// distinguishable from the fixed-target resolvers.
const CALL_RE =
  /\b(?:resolveWindows(?:(System32Path)\(\s*"([^"]*)"|(CmdExePath)\(|(PowerShellPath)\(|(WmicPath)\()|(selectWindowsShellPath)\()/gu;

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
  const [, system32, executableName, cmdExe, powerShell, wmic] = match;
  if (system32) {
    return resolveWindowsSystem32Path(executableName ?? "", TEST_ENV);
  }
  if (cmdExe) {
    return resolveWindowsCmdExePath(TEST_ENV);
  }
  if (powerShell) {
    return resolveWindowsPowerShellPath(TEST_ENV);
  }
  if (wmic) {
    return resolveWindowsWmicPath(TEST_ENV);
  }
  // TEST_ENV carries no ComSpec, so this is the pinned branch. The override branch is
  // behavioural and lives in `exec.windows.test.ts`; here it would make the inventory
  // depend on whatever ComSpec the host running the suite happens to have.
  return selectWindowsShellPath(TEST_ENV).path;
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
