import { describe, expect, it } from "vitest";
import {
  collectTestHelperExtensionImportBoundaryInventory,
  main,
} from "../scripts/check-test-helper-extension-import-boundary.mjs";
import { createCapturedIo } from "./helpers/captured-io.js";

// The fork inverts the upstream `test/helpers/` → `extensions/` boundary
// policy. Fork-side test helpers under `test/helpers/extensions/*` deliberately
// reach into `extensions/<id>/` for bundled-channel fixtures. The "stays
// empty" assertions therefore test a policy the fork no longer holds; they're
// skipped. The "produces stable sorted output" case still verifies a useful
// determinism property and stays active.
describe("test-helper extension import boundary inventory", () => {
  it.skip("stays empty", async () => {
    expect(await collectTestHelperExtensionImportBoundaryInventory()).toEqual([]);
  });

  it("produces stable sorted output", async () => {
    const first = await collectTestHelperExtensionImportBoundaryInventory();
    const second = await collectTestHelperExtensionImportBoundaryInventory();

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
