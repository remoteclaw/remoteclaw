/** Shared Vitest module mocks for isolated-agent cron tests. */
// Isolated turns lazily consume this process-stable runtime after agent execution. Load it during
// suite setup so first-test timings cover cron behavior rather than module initialization.
import "../utils/usage-format.js";
import { vi } from "vitest";

vi.mock("../agents/provider-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/provider-utils.js")>();
  return {
    ...actual,
    isCliProvider: vi.fn(() => false),
  };
});

vi.mock("../agents/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: vi.fn(),
}));

vi.mock("./isolated-agent/run-runtime-plugins.runtime.js", () => ({
  ensureRuntimePluginsLoaded: vi.fn(),
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));
