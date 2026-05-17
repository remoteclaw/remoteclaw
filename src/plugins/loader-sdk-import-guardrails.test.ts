import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Fork-adapted from upstream openclaw/openclaw@44e5b62c27:
// - The upstream LOADER_FIXTURE_TEST_FILES referenced `loader.cli-metadata.test.ts`
//   and `loader.git-path-regression.test.ts`, neither of which exists in this fork.
// - The upstream ALLOWED set hard-codes lines that live only in those removed
//   fixtures, so it is empty here. The guardrail's intent — keep `loader.test.ts`
//   fixtures off the SDK except via explicitly listed smoke tests — still applies
//   to the one fixture file the fork retains.
// - SDK specifier rebranded `openclaw/plugin-sdk` → `remoteclaw/plugin-sdk`.
const ALLOWED_PLUGIN_SDK_FIXTURE_IMPORTS = new Set<string>([]);

const LOADER_FIXTURE_TEST_FILES = ["src/plugins/loader.test.ts"];

function findLoaderFixtureSdkImports(): string[] {
  const repoRoot = process.cwd();
  const matches: string[] = [];
  for (const file of LOADER_FIXTURE_TEST_FILES) {
    const source = fs.readFileSync(path.join(repoRoot, file), "utf-8");
    for (const line of source.split("\n")) {
      if (
        line.includes('require("remoteclaw/plugin-sdk') ||
        (line.includes("import ") && line.includes('"remoteclaw/plugin-sdk'))
      ) {
        matches.push(`${file}:${line.trim()}`);
      }
    }
  }
  return matches;
}

describe("plugin loader fixture SDK imports", () => {
  it("keeps generated jiti plugin fixtures off the SDK except explicit compatibility smokes", () => {
    const unexpected = findLoaderFixtureSdkImports().filter(
      (entry) => !ALLOWED_PLUGIN_SDK_FIXTURE_IMPORTS.has(entry),
    );

    expect(unexpected).toEqual([]);
  });
});
