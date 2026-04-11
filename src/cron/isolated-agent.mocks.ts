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
