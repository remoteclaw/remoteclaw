// Resolves Windows system binaries to absolute %SystemRoot% paths.
//
// Spawning a Windows system binary by bare name ("netstat", "cmd.exe", …) lets
// %PATH% — and, under some configurations, the current working directory —
// decide which executable actually runs. Pinning to %SystemRoot% removes that
// search entirely (CWE-426, Untrusted Search Path).
//
// This is a deliberate twin of `scripts/windows-cmd-helpers.mjs`, which carries
// the same resolution and hardening semantics for the build-tooling side. The
// two cannot share code: the scripts copy is `.mjs`, loaded by plain `node`
// (so it cannot import TypeScript), it lives outside the tsconfig `include`,
// and `scripts/lib/docker-e2e-package.sh` bind-mounts it into a container as a
// single standalone file. Keep the two in sync by hand when either changes.
import path from "node:path";

const DEFAULT_WINDOWS_SYSTEM_ROOT = "C:\\Windows";
const WINDOWS_SYSTEM32_EXE_NAME_RE = /^[A-Za-z0-9_.-]+\.exe$/u;

function getEnvValueCaseInsensitive(
  env: NodeJS.ProcessEnv,
  expectedKey: string,
): string | undefined {
  const direct = env[expectedKey];
  if (direct !== undefined) {
    return direct;
  }
  // Windows env keys are case-insensitive; a caller-supplied object may not be.
  const expected = expectedKey.toUpperCase();
  const actualKey = Object.keys(env).find((key) => key.toUpperCase() === expected);
  return actualKey ? env[actualKey] : undefined;
}

// Segment-exact, not a substring test: dots are legal inside a Windows directory
// name (`C:\Win..dows`), and `...` is a literal segment to `path.win32.normalize`,
// not a parent reference.
function hasParentTraversalSegment(rawPath: string): boolean {
  return rawPath.split(/[\\/]/u).includes("..");
}

function normalizeWindowsSystemRoot(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (
    !trimmed ||
    trimmed.includes("\0") ||
    trimmed.includes("\r") ||
    trimmed.includes("\n") ||
    trimmed.includes(";") ||
    hasParentTraversalSegment(trimmed)
  ) {
    return null;
  }
  // The traversal check above deliberately precedes this: `normalize` collapses
  // `..`, so `C:\Windows\..\Users\pub\evil` would reach the checks below as
  // `C:\Users\pub\evil` — absolute, drive-rooted and non-UNC — and satisfy every
  // one of them, redirecting every pinned spawn at once.
  const normalized = path.win32.normalize(trimmed);
  // Reject relative roots and UNC paths — a remote share must never win here.
  if (!path.win32.isAbsolute(normalized) || normalized.startsWith("\\\\")) {
    return null;
  }
  const parsed = path.win32.parse(normalized);
  if (!/^[A-Za-z]:\\$/.test(parsed.root) || normalized.length <= parsed.root.length) {
    return null;
  }
  return normalized.replace(/[\\/]+$/, "");
}

/** Resolve the Windows install root, falling back to `C:\Windows` when unusable. */
export function resolveWindowsSystemRoot(env: NodeJS.ProcessEnv = process.env): string {
  return (
    normalizeWindowsSystemRoot(getEnvValueCaseInsensitive(env, "SystemRoot")) ??
    normalizeWindowsSystemRoot(getEnvValueCaseInsensitive(env, "WINDIR")) ??
    DEFAULT_WINDOWS_SYSTEM_ROOT
  );
}

/** Resolve an absolute `%SystemRoot%\System32\<name>.exe` path. */
export function resolveWindowsSystem32Path(
  executableName: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (
    path.win32.basename(executableName) !== executableName ||
    !WINDOWS_SYSTEM32_EXE_NAME_RE.test(executableName)
  ) {
    throw new Error(`Invalid Windows System32 executable name: ${executableName}`);
  }
  // Always win32 joins: the result is a Windows path even when this code runs
  // on a POSIX host (tests, cross-platform tooling).
  return path.win32.join(resolveWindowsSystemRoot(env), "System32", executableName);
}

/** Resolve the absolute path to `cmd.exe`. */
export function resolveWindowsCmdExePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveWindowsSystem32Path("cmd.exe", env);
}

/** Resolve the absolute path to Windows PowerShell (not in System32 directly). */
export function resolveWindowsPowerShellPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.win32.join(
    resolveWindowsSystemRoot(env),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

/** Resolve the absolute path to `wmic.exe`, which lives under System32\wbem. */
export function resolveWindowsWmicPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.win32.join(resolveWindowsSystemRoot(env), "System32", "wbem", "WMIC.exe");
}
