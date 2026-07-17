import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pluginSdkSubpaths } from "../../scripts/lib/plugin-sdk-entries.mjs";
import rootVitestConfig from "../../vitest.config.ts";

// The repo-root `vitest.config.ts` owns the plugin-sdk aliases for bare `vitest`,
// `pnpm test:watch`, and — via the `baseConfig` spread in `vitest.unit.config.ts` —
// the CI unit lane. It is the one alias list not derived from the shared source of
// truth, so it silently drifted and dropped `request-url` (#2964); nothing caught it
// because no unit-lane test imported that subpath. These assertions are that guard.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type AliasEntry = { find: string | RegExp; replacement: string };

const aliasEntries = rootVitestConfig.resolve?.alias as AliasEntry[];
const stringFinds = aliasEntries
  .map((entry) => entry.find)
  .filter((find): find is string => typeof find === "string");

function listLocalPluginSdkSubpaths(): string[] {
  return fs
    .readdirSync(path.join(repoRoot, "src", "plugin-sdk"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name.slice(0, -".ts".length))
    .filter((subpath) => subpath !== "index" && !/\.(?:test|spec|d)$/u.test(subpath));
}

describe("root vitest.config.ts plugin-sdk aliases", () => {
  it("exposes the alias list as an ordered array", () => {
    expect(Array.isArray(aliasEntries)).toBe(true);
    expect(stringFinds.length).toBeGreaterThan(0);
  });

  it("aliases every subpath in the shared source of truth", () => {
    const missing = pluginSdkSubpaths.filter(
      (subpath) => !stringFinds.includes(`remoteclaw/plugin-sdk/${subpath}`),
    );

    expect(missing).toEqual([]);
  });

  it("aliases every subpath backed by a src/plugin-sdk source file", () => {
    const missing = listLocalPluginSdkSubpaths().filter(
      (subpath) => !stringFinds.includes(`remoteclaw/plugin-sdk/${subpath}`),
    );

    expect(missing).toEqual([]);
  });

  it("points request-url at its real source file (#2964)", () => {
    const entry = aliasEntries.find((item) => item.find === "remoteclaw/plugin-sdk/request-url");

    expect(entry).toBeDefined();
    expect(entry?.replacement).toBe(path.join(repoRoot, "src", "plugin-sdk", "request-url.ts"));
    expect(fs.existsSync(entry?.replacement ?? "")).toBe(true);
  });

  it("keeps the prefix-matching barrel alias last so subpaths win", () => {
    const barrelIndex = stringFinds.indexOf("remoteclaw/plugin-sdk");

    expect(barrelIndex).toBe(stringFinds.length - 1);
  });

  // Imported dynamically so a resolution failure fails this test with a readable
  // error instead of aborting collection for the whole file.
  it("resolves the bare request-url subpath at runtime (#2964)", async () => {
    const { resolveRequestUrl } = await import("remoteclaw/plugin-sdk/request-url");

    expect(resolveRequestUrl("https://example.invalid/y")).toBe("https://example.invalid/y");
    expect(resolveRequestUrl(new URL("https://example.invalid/x"))).toBe(
      "https://example.invalid/x",
    );
  });
});
