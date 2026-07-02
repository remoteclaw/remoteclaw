import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Exercises scripts/ci/check-rebrand-leakage.sh "scan 3" (positive-presence
// fork-identity anchors). The macOS Package.swift carries the fork's binary
// identity as NAMES (`remoteclaw-mac` executable + `RemoteClawMacCLI` target)
// rather than a reverse-domain string, so a wholesale revert to upstream's
// names is invisible to scan 1 (apps/ is broadly allowlisted) and scan 2
// (Package.swift is not a reverse-domain manifest). See issue #2697.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

const GATE_REL = "scripts/ci/check-rebrand-leakage.sh";
const GATE_FILES = [
  GATE_REL,
  "scripts/ci/rebrand-allowlist.txt",
  "scripts/ci/rebrand-reverse-domain-allowlist.txt",
];
const PACKAGE_REL = "apps/macos/Package.swift";

// Minimal but representative SwiftPM manifest carrying both fork-identity names.
const FORK_PACKAGE = [
  "// swift-tools-version: 6.2",
  "import PackageDescription",
  "let package = Package(",
  '    name: "RemoteClaw",',
  "    products: [",
  '        .executable(name: "remoteclaw-mac", targets: ["RemoteClawMacCLI"]),',
  "    ],",
  "    targets: [",
  '        .executableTarget(name: "RemoteClawMacCLI", path: "Sources/RemoteClawMacCLI"),',
  "    ])",
  "",
].join("\n");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// Builds a throwaway git repo containing the REAL gate + its REAL allowlists, so
// the test exercises the actual apps/ exemption that lets a binary-name revert
// slip past scans 1 & 2. `packageBody === null` omits Package.swift entirely.
// `extraFiles` seeds additional tracked files (relative path → contents), used by
// the scan-4 tests to plant an openclaw.plugin.json the content-scan can't see.
function makeRepo(packageBody: string | null, extraFiles: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-rebrand-gate-"));
  tempDirs.push(dir);
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test User");

  const tracked: string[] = [];
  for (const rel of GATE_FILES) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, rel), dest);
    tracked.push(rel);
  }
  if (packageBody !== null) {
    const dest = path.join(dir, PACKAGE_REL);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, packageBody);
    tracked.push(PACKAGE_REL);
  }
  for (const [rel, contents] of Object.entries(extraFiles)) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, contents);
    tracked.push(rel);
  }

  git(dir, "add", "--", ...tracked);
  git(dir, "commit", "-q", "-m", "fixture");
  return dir;
}

// Runs the gate in --all mode; returns exit status + combined output.
function runGate(repo: string): { status: number; output: string } {
  try {
    const stdout = execFileSync("bash", [GATE_REL, "--all"], {
      cwd: repo,
      encoding: "utf8",
    });
    return { status: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("check-rebrand-leakage scan 3 (fork-identity anchors)", () => {
  it("passes when Package.swift carries both fork-identity names", () => {
    const { status, output } = runGate(makeRepo(FORK_PACKAGE));
    expect(status).toBe(0);
    expect(output).toContain("No rebrand leakage detected.");
  });

  it("fails when the remoteclaw-mac executable name is absent", () => {
    // Neutral replacement (no `openclaw` substring) isolates scan 3 from scan 1.
    const reverted = FORK_PACKAGE.replaceAll("remoteclaw-mac", "binary-mac");
    const { status, output } = runGate(makeRepo(reverted));
    expect(status).toBe(1);
    expect(output).toContain(PACKAGE_REL);
    expect(output).toContain("missing required fork identity 'remoteclaw-mac'");
  });

  it("fails when the RemoteClawMacCLI target name is absent", () => {
    const reverted = FORK_PACKAGE.replaceAll("RemoteClawMacCLI", "BinaryMacCLI");
    const { status, output } = runGate(makeRepo(reverted));
    expect(status).toBe(1);
    expect(output).toContain("missing required fork identity 'RemoteClawMacCLI'");
  });

  it("catches a realistic upstream revert that scan 1's apps/ allowlist masks", () => {
    // `openclaw-mac` / `OpenClawMacCLI` DO contain `openclaw`, but live under
    // apps/ which scan 1 broadly exempts — so only scan 3 can catch this.
    const reverted = FORK_PACKAGE.replaceAll("remoteclaw-mac", "openclaw-mac").replaceAll(
      "RemoteClawMacCLI",
      "OpenClawMacCLI",
    );
    const { status, output } = runGate(makeRepo(reverted));
    expect(status).toBe(1);
    expect(output).toContain("missing required fork identity 'remoteclaw-mac'");
  });

  it("tolerates a legitimately-absent anchor file (subsystem gutted)", () => {
    const { status, output } = runGate(makeRepo(null));
    expect(status).toBe(0);
    expect(output).toContain("No rebrand leakage detected.");
  });
});

describe("check-rebrand-leakage scan 4 (dead openclaw.plugin.json filenames)", () => {
  // A dead manifest whose CONTENTS carry no `openclaw` substring — so only the
  // FILENAME leaks and scan 1 (content grep) cannot see it. This is exactly the
  // drift class every upstream sync re-imports. Package.swift is omitted (null)
  // to isolate scan 4 from scan 3.
  const DEAD_MANIFEST = '{\n  "id": "probe",\n  "channels": ["probe"]\n}\n';

  it("passes when a plugin ships only the live remoteclaw.plugin.json", () => {
    const { status, output } = runGate(
      makeRepo(null, { "extensions/probe/remoteclaw.plugin.json": DEAD_MANIFEST }),
    );
    expect(status).toBe(0);
    expect(output).toContain("No rebrand leakage detected.");
  });

  it("fails on a dead openclaw.plugin.json the content-scan cannot see", () => {
    const { status, output } = runGate(
      makeRepo(null, { "extensions/probe/openclaw.plugin.json": DEAD_MANIFEST }),
    );
    expect(status).toBe(1);
    expect(output).toContain("Dead openclaw.plugin.json manifest(s) detected");
    expect(output).toContain("extensions/probe/openclaw.plugin.json");
    // Scan 1 (content grep) must NOT be what fired — the manifest body is clean.
    expect(output).not.toContain("Rebrand leakage detected");
  });

  it("matches the exact basename only — a filename merely containing 'openclaw' is ignored", () => {
    // `openclaw-notes.json` and an `openclaw-compat/` path segment both contain
    // the substring but are not the manifest; neither may trip scan 4 (cf. the
    // real repo's from-openclaw.mdx / openclaw-prepack.ts / OpenClawProtocol*.kt).
    const { status, output } = runGate(
      makeRepo(null, {
        "extensions/probe/openclaw-notes.json": '{\n  "note": "legit"\n}\n',
        "extensions/openclaw-compat/remoteclaw.plugin.json": DEAD_MANIFEST,
      }),
    );
    expect(status).toBe(0);
    expect(output).toContain("No rebrand leakage detected.");
  });
});
