// Vitest unit support config wires the unit support test shard.
import { createUnitVitestConfigWithOptions } from "./vitest.unit.config.ts";

export default createUnitVitestConfigWithOptions(process.env, {
  name: "unit-support",
  includePatterns: ["packages/**/*.test.ts"],
  extraExcludePatterns: [
    // The gateway-client package owns its own browser/runtime protocol lane.
    "packages/gateway-client/src/**/*.test.ts",
    // Protocol tests live under src/gateway/protocol/ (the authoritative gateway
    // protocol home) and run in the main unit lane, so keep them out of this
    // packages-scoped support lane.
    "src/gateway/protocol/**/*.test.ts",
    "packages/gateway-client/src/**/*.test.ts",
  ],
  passWithNoTests: true,
});
