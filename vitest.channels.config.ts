import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export default createScopedVitestConfig([
  "extensions/telegram/**/*.test.ts",
  "extensions/discord/**/*.test.ts",
  "extensions/whatsapp/**/*.test.ts",
  "src/browser/**/*.test.ts",
  "src/line/**/*.test.ts",
]);
