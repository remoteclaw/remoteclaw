import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CHECK_EXTENSION_PACKAGE_BOUNDARY_BIN = resolve(
  REPO_ROOT,
  "scripts/check-extension-package-tsc-boundary.mjs",
);

function runNode(args: string[], timeout: number) {
  return spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout,
  });
}

// Runs unconditionally, including in CI: the `test` job collects this file via
// vitest.unit.config.ts (its include keeps `test/**/*.test.ts`), so the canary
// case below executes on every PR.
//
// fork: the upstream `--mode=compile` isolated-extension-package gate was retired
// in RemoteClaw (#2696). RemoteClaw is a hard fork that guts the execution engine
// and KEEPS the channel-adapter layer; those adapters deliberately deep-import the
// kept monolith (`../../src/...`), abandoning upstream's isolated-package model. So
// `--mode=compile` enforced a non-invariant for this fork AND was itself dead (the
// suite used to be CI-skipped). `--mode=canary` is the surviving live check: it
// proves the rootDir wall is enforceable by asserting a deep `src/` import FAILS
// with TS6059. Whole-program type soundness is covered separately by `pnpm tsgo`.
describe("opt-in extension package TypeScript boundaries", () => {
  it("fails when opt-in extensions import src/cli through a relative path", () => {
    const result = runNode([CHECK_EXTENSION_PACKAGE_BOUNDARY_BIN, "--mode=canary"], 180_000);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
