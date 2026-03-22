import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export default createScopedVitestConfig(["extensions/**/*.test.ts"], {
  pool: "threads",
  passWithNoTests: true,
});
