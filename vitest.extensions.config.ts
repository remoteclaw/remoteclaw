import { EXTENSIONS_QUARANTINE } from "./vitest.quarantine.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

// `extensions/**/*.test.ts` covers every channel adapter AND extension-side
// auto-reply handlers (extensions/*/src/auto-reply/**). Run by the CI
// `test-extensions` lane (#2779). Currently-failing files are quarantined in
// vitest.quarantine.ts so the lane is required-and-green.
export default createScopedVitestConfig(["extensions/**/*.test.ts"], EXTENSIONS_QUARANTINE);
