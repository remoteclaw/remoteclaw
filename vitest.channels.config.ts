import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export default createScopedVitestConfig([
  "src/telegram/**/*.test.ts",
  "src/discord/**/*.test.ts",
  "src/web/**/*.test.ts",
  "src/browser/**/*.test.ts",
  "src/line/**/*.test.ts",
]);
