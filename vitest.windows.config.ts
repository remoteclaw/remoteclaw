import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

// The `test-windows` lane (a narrow spike, NOT a full-suite port).
//
// The project ships a Windows install path — README.md advertises
// `irm https://remoteclaw.ps | iex` — and had zero Windows CI coverage: every
// `runs-on:` in `.github/workflows/` was Ubuntu. Two Windows-targeted security PRs
// (#3088, #3116) merged on static reasoning alone, and the resolver census in
// `windows-system-paths.call-sites.test.ts` has a mutation-proven blind spot it
// documents in its own header. The fix this lane exists to protect is the one it
// took to make a Windows lane possible at all: `runtime-factory` looked binaries up
// with `which`, which does not exist on Windows, so every configured runtime failed
// validation and RemoteClaw could not start there.
//
// WHY AN EXPLICIT FILE LIST RATHER THAN A GLOB. A glob over `src/**/*.test.ts` is an
// epic, not a spike: 397 of the 2,302 tracked `*.test.ts` files hardcode a POSIX
// absolute path (`"/tmp/…"`, `"/usr/…"`, `"/home/…"`, …) — 2,184 occurrences, 316 of
// those files under `src/` alone. Porting that is out of scope here and tracked
// separately; a lane that cannot pass teaches people to ignore it. So the include
// list below is a membership decision, one file at a time, and adding a file to it
// is a reviewable act.
//
// ADMISSION RULE — a file belongs here if running it ON WINDOWS can produce a signal
// that running it on Ubuntu cannot: it exercises a `win32` branch, a Windows
// system-path resolution, Windows process/ACL/encoding behaviour, or (for
// `path-lookup`) actually spawns the resolved lookup command against the host PATH.
// Do NOT add a file merely because it passes on Windows.
//
// DELIBERATELY EXCLUDED, and why — these are Windows-relevant but not yet portable:
//   - `src/infra/host-env-security.test.ts`      — 106 hardcoded POSIX path literals
//   - `src/cli/update-cli/restart-helper.test.ts` — 11, in the emitted-script assertions
//   - `src/daemon/program-args.test.ts`           — 17, incl. the PATH-lookup helper's
//                                                   own caller (covered here instead by
//                                                   `src/infra/path-lookup.test.ts`)
//   - `src/commands/onboard-helpers.test.ts`      — under `src/commands/**`, which every
//                                                   fork vitest lane excludes already
// Their Windows behaviour still rides on the Ubuntu lanes' platform-forced assertions,
// which is what it did before this lane existed — no coverage was moved or lost.
export default createScopedVitestConfig([
  // The PATH-lookup selector: spawns the real resolved command against the real host
  // PATH, so on this lane it is the one test that proves `where.exe` actually resolves.
  "src/infra/path-lookup.test.ts",
  // The regression this lane was opened for.
  "src/middleware/runtime-factory.test.ts",
  // Windows system-path hardening (#3088, #3091, #3100, #3112, #3116).
  "src/infra/windows-system-paths.test.ts",
  "src/infra/windows-system-paths.call-sites.test.ts",
  "src/infra/windows-encoding.test.ts",
  "src/infra/windows-task-restart.test.ts",
  // %ComSpec% selection and the shell-spawn boundary.
  "src/process/exec.windows.test.ts",
  "src/process/kill-tree.test.ts",
  // Windows ACL and port-inspection resolver call sites.
  "src/security/windows-acl.test.ts",
  "src/infra/ports.test.ts",
]);
