import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";
import {
  unitTestAdditionalExcludePatterns,
  unitTestIncludePatterns,
} from "./vitest.unit-paths.mjs";

const base = baseConfig as unknown as Record<string, unknown>;
const baseTest = (baseConfig as { test?: { include?: string[]; exclude?: string[] } }).test ?? {};
const exclude = baseTest.exclude ?? [];

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    include,
    exclude: [
      ...exclude,
      "src/gateway/**",
      "extensions/**",
      "extensions/telegram/**",
      "extensions/discord/**",
      "extensions/whatsapp/**",
      "src/browser/**",
      "src/line/**",
      "src/agents/**",
      "src/auto-reply/**",
      "src/commands/**",
    ],
  },
});
