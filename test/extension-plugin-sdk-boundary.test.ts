import { describe, expect, it } from "vitest";
import {
  collectExtensionPluginSdkBoundaryInventory,
  diffInventory,
} from "../scripts/check-extension-plugin-sdk-boundary.mjs";

function createCapturedIo() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: {
        write(chunk) {
          stdout += String(chunk);
        },
      },
      stderr: {
        write(chunk) {
          stderr += String(chunk);
        },
      },
    },
    readStdout: () => stdout,
    readStderr: () => stderr,
  };
}

describe("extension src outside plugin-sdk boundary inventory", () => {
  it("produces stable sorted output", async () => {
    const first = await collectExtensionPluginSdkBoundaryInventory("src-outside-plugin-sdk");
    const second = await collectExtensionPluginSdkBoundaryInventory("src-outside-plugin-sdk");

    expect(second).toEqual(first);
    expect(
      [...first].toSorted(
        (left, right) =>
          left.file.localeCompare(right.file) ||
          left.line - right.line ||
          left.kind.localeCompare(right.kind) ||
          left.specifier.localeCompare(right.specifier) ||
          left.resolvedPath.localeCompare(right.resolvedPath) ||
          left.reason.localeCompare(right.reason),
      ),
    ).toEqual(first);
  });

  it("captures known current production violations", async () => {
    const inventory = await collectExtensionPluginSdkBoundaryInventory("src-outside-plugin-sdk");

    expect(inventory).toContainEqual(
      expect.objectContaining({
        file: "extensions/discord/src/monitor.tool-result.test-harness.ts",
        resolvedPath: "src/test-utils/vitest-mock-fn.js",
      }),
    );
    expect(inventory).toContainEqual(
      expect.objectContaining({
        file: "extensions/googlechat/src/setup-core.ts",
        resolvedPath: "src/channels/plugins/setup-helpers.js",
      }),
    );
  });

  it("matches the checked-in baseline", async () => {
    const expected = readBaseline("extension-src-outside-plugin-sdk-inventory.json");
    const actual = await collectExtensionPluginSdkBoundaryInventory("src-outside-plugin-sdk");

    expect(diffInventory(expected, actual)).toEqual({ missing: [], unexpected: [] });
  });

  it("script json output matches the baseline exactly", () => {
    const stdout = execFileSync(
      process.execPath,
      [scriptPath, "--mode=src-outside-plugin-sdk", "--json"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(JSON.parse(stdout)).toEqual(
      readBaseline("extension-src-outside-plugin-sdk-inventory.json"),
    );
  });
});

describe("extension plugin-sdk-internal boundary inventory", () => {
  it("is currently empty", async () => {
    const inventory = await collectExtensionPluginSdkBoundaryInventory("plugin-sdk-internal");

    expect(inventory).toEqual([]);
  });

  it("matches the checked-in empty baseline", async () => {
    const expected = readBaseline("extension-plugin-sdk-internal-inventory.json");
    const actual = await collectExtensionPluginSdkBoundaryInventory("plugin-sdk-internal");

    expect(exitCode).toBe(0);
    expect(captured.readStderr()).toBe("");
    expect(JSON.parse(captured.readStdout())).toEqual([]);
  });
});

describe("extension relative-outside-package boundary inventory", () => {
  it("is currently empty", async () => {
    const inventory = await collectExtensionPluginSdkBoundaryInventory("relative-outside-package");

    expect(inventory).toEqual([]);
  });

  it("script json output is empty", async () => {
    const captured = createCapturedIo();
    const exitCode = await main(["--mode=relative-outside-package", "--json"], captured.io);

    expect(exitCode).toBe(0);
    expect(captured.readStderr()).toBe("");
    expect(JSON.parse(captured.readStdout())).toEqual([]);
  });
});
