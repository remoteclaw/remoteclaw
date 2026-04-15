import { vi } from "vitest";
import {
  makeIsolatedAgentJobFixture,
  makeIsolatedAgentParamsFixture,
} from "./isolated-agent/job-fixtures.js";

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

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));

export const makeIsolatedAgentJob = makeIsolatedAgentJobFixture;
export const makeIsolatedAgentParams = makeIsolatedAgentParamsFixture;
