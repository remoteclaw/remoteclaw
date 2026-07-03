import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

export function createScopedVitestConfig(include: string[], extraExclude: string[] = []) {
  const base = baseConfig as unknown as Record<string, unknown>;
  const baseTest = (baseConfig as { test?: { exclude?: string[] } }).test ?? {};
  const exclude = baseTest.exclude ?? [];

  return defineConfig({
    ...base,
    test: {
      ...baseTest,
      include,
      // `extraExclude` is the per-lane quarantine denylist (see vitest.quarantine.ts):
      // currently-failing test files excluded so the lane can be a required, green gate
      // that still catches NEW regressions in every non-quarantined file.
      exclude: [...exclude, ...extraExclude],
    },
  });
}
