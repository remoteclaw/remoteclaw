// Resolves the command that answers "does <name> exist on PATH?" for the host.
//
// `which` is POSIX-only — there is no `which` on Windows, so every call site that
// hardcoded it fails with ENOENT there rather than reporting whether the binary
// exists. The Windows equivalent is `where.exe`.
//
// It is resolved to an absolute `%SystemRoot%\System32` path rather than spawned
// by bare name: spawning `where` by name lets `%PATH%` — and, under some
// configurations, the current working directory — decide which executable
// actually runs (CWE-426, Untrusted Search Path). That is the same hardening every
// other Windows system-binary spawn in this tree carries; see
// `windows-system-paths.ts`, and `windows-system-paths.call-sites.test.ts` for the
// census that pins this call site's resolved path.
//
// Deliberately one implementation rather than one branch per caller: a second copy
// of this selector is how a portability pass silently misses a call site. One caller
// stays outside it on purpose — `commands/onboard-helpers.ts` spawns an argv array
// whose POSIX form is `["/usr/bin/env", "which", name]`, not a bare command word.
//
// Scope, stated plainly: this makes the lookup WORK on Windows and pins the Windows
// command. It changes nothing about POSIX, where the returned `which` is still a bare
// name resolved through %PATH%. Pinning that too would need its own decision and a
// different absolute path per distro; it is out of scope here.
import { resolveWindowsSystem32Path } from "./windows-system-paths.js";

/**
 * The command to spawn with a single binary-name argument to test PATH presence.
 *
 * Exit status is the answer on both platforms: 0 when found, non-zero otherwise.
 *
 * `platform` and `env` are injectable so both branches are testable from either
 * host — the Windows branch must not be reachable only on a Windows runner.
 */
export function resolvePathLookupCommand(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return platform === "win32" ? resolveWindowsSystem32Path("where.exe", env) : "which";
}
