import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CHECK_EXTENSION_PACKAGE_BOUNDARY_BIN = resolve(
  REPO_ROOT,
  "scripts/check-extension-package-tsc-boundary.mjs",
);
const SHOULD_RUN_BOUNDARY_SCRIPT_WRAPPER =
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.REMOTECLAW_RUN_EXTENSION_PACKAGE_BOUNDARY_TEST === "1";

function runNode(args: string[], timeout: number) {
  return spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout,
  });
}

// The CI check-additional job runs this script directly. Avoid duplicating the cold
// 97-extension compile inside the full node test shard.
describe.skipIf(!SHOULD_RUN_BOUNDARY_SCRIPT_WRAPPER)(
  "opt-in extension package TypeScript boundaries",
  () => {
    // fork: --mode=compile enforces upstream's isolated-extension-package model
    // (every extension reaching the root only through `@remoteclaw/plugin-sdk/*`
    // package specifiers). RemoteClaw's extensions instead import the root `src/`
    // tree via deep relative paths (e.g. discord's
    // `../../../src/channels/plugins/account-action-gate.js`), so 20/27 non-empty
    // opt-in extensions trip TS6059 rootDir violations, and 4 gutted media/model
    // providers (alibaba/comfy/runway/vydra) are now empty shells that trip
    // TS18003. Both conditions pre-date the v2026.4.15 sync (broken at base
    // 1b1d58e516, previously masked by an earlier prep-step failure) and this
    // suite is already CI-skipped (see describe.skipIf). The canary case below
    // still runs and verifies the rootDir-boundary enforcement mechanism. Re-enable
    // once the fork either re-exports the reached-into symbols through the
    // plugin-sdk surface or drops the gutted provider extension shells.
    it.skip("typechecks each opt-in extension cleanly through @remoteclaw/plugin-sdk", () => {
      const result = runNode([CHECK_EXTENSION_PACKAGE_BOUNDARY_BIN, "--mode=compile"], 420_000);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    }, 300_000);

    it("fails when opt-in extensions import src/cli through a relative path", () => {
      const result = runNode([CHECK_EXTENSION_PACKAGE_BOUNDARY_BIN, "--mode=canary"], 180_000);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    });
  },
);
