import { describe, expect, it } from "vitest";
import {
  collectSrcExtensionImportBoundaryInventory,
  main,
} from "../scripts/check-src-extension-import-boundary.mjs";
import { createCapturedIo } from "./helpers/captured-io.js";

// The fork inverts the upstream `src/` → `extensions/` boundary policy.
// Fork-side `src/plugin-sdk/*.ts` and other surfaces deliberately re-export
// types from `extensions/<id>/src/...` (see e.g. PR #2558). The "stays empty"
// assertions therefore test a policy the fork no longer holds; they're
// skipped. The "produces stable sorted output" case still verifies a useful
// determinism property and stays active.
describe("src extension import boundary inventory", () => {
  it.skip("stays empty", async () => {
    expect(await collectSrcExtensionImportBoundaryInventory()).toEqual([]);
  });

  it("produces stable sorted output", async () => {
    const first = await collectSrcExtensionImportBoundaryInventory();
    const second = await collectSrcExtensionImportBoundaryInventory();

    expect(second).toEqual(first);
  });

  it.skip("script json output stays empty", async () => {
    const captured = createCapturedIo();
    const exitCode = await main(["--json"], captured.io);

    expect(exitCode).toBe(0);
    expect(captured.readStderr()).toBe("");
    expect(JSON.parse(captured.readStdout())).toEqual([]);
  });
});
