import { describe, expect, it } from "vitest";
import {
  collectSdkPackageExtensionImportBoundaryInventory,
  main,
} from "../scripts/check-sdk-package-extension-import-boundary.mjs";
import { createCapturedIo } from "./helpers/captured-io.js";

// The fork inverts the upstream `src/plugin-sdk/` → `extensions/` boundary
// policy. `src/plugin-sdk/{discord,bluebubbles,imessage,...}.ts` deliberately
// re-export types from `extensions/<id>/src/...` so bundled channel adapters
// can expose typed surfaces through the plugin SDK (see e.g. PR #2558:
// "rectify(discord): port src/discord/ → extensions/discord/src/"). The
// "stays empty" assertions therefore test a policy the fork no longer holds;
// they're skipped. The "produces stable sorted output" case still verifies a
// useful determinism property and stays active.
describe("sdk/package extension import boundary inventory", () => {
  it.skip("stays empty", async () => {
    expect(await collectSdkPackageExtensionImportBoundaryInventory()).toEqual([]);
  });

  it("produces stable sorted output", async () => {
    const first = await collectSdkPackageExtensionImportBoundaryInventory();
    const second = await collectSdkPackageExtensionImportBoundaryInventory();

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
