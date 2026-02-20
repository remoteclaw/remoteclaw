import { vi } from "vitest";

vi.mock("../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/index.js")>();
  return {
    ...actual,
    ChannelBridge: vi.fn(),
    ClaudeCliRuntime: vi.fn(),
  };
});

vi.mock("../agents/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: vi.fn(),
}));
