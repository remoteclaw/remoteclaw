// Test-only surface for bundled plugins that register health checks: exposes the
// registry reset so a plugin's own doctor test can start from a clean slate. Kept
// separate from `./health.js` so the production barrel never advertises a mutator.
export { clearHealthChecksForTest } from "./_health/health-check-registry.js";
