import { AUTO_REPLY_QUARANTINE } from "./vitest.quarantine.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

// Repo-root auto-reply path only: `src/auto-reply/**/*.test.ts`. Extension-side
// auto-reply handlers (extensions/*/src/auto-reply/**) are covered by the
// `test-extensions` lane, so scoping here to `src/auto-reply` keeps the two
// lanes non-overlapping. Run by the CI `test-auto-reply` lane (#2779).
// Currently-failing files are quarantined in vitest.quarantine.ts.
export default createScopedVitestConfig(["src/auto-reply/**/*.test.ts"], AUTO_REPLY_QUARANTINE);
