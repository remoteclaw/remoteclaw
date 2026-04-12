import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSessionStoreTargets } from "./session-store-targets.js";

const resolveStorePathMock = vi.hoisted(() => vi.fn());
const resolveSoleAgentIdMock = vi.hoisted(() => vi.fn());
const listAgentIdsMock = vi.hoisted(() => vi.fn());

vi.mock("../config/sessions.js", () => ({
  resolveStorePath: resolveStorePathMock,
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveSoleAgentId: resolveSoleAgentIdMock,
  listAgentIds: listAgentIdsMock,
  resolveAgentRuntime: () => "claude",
}));

describe("resolveSessionStoreTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSoleAgentIdMock.mockReturnValue(null);
    listAgentIdsMock.mockReturnValue([]);
  });

  it("resolves the default agent store when no selector is provided", () => {
    resolveSoleAgentIdMock.mockReturnValue("alpha");
    resolveStorePathMock.mockReturnValue("/tmp/alpha-sessions.json");

    const targets = resolveSessionStoreTargets({}, {});

    expect(targets).toEqual([{ agentId: "alpha", storePath: "/tmp/alpha-sessions.json" }]);
    expect(resolveStorePathMock).toHaveBeenCalledWith(undefined, { agentId: "alpha" });
  });

  it("resolves all configured agent stores", () => {
    listAgentIdsMock.mockReturnValue(["alpha", "beta"]);
    resolveStorePathMock
      .mockReturnValueOnce("/tmp/alpha-sessions.json")
      .mockReturnValueOnce("/tmp/beta-sessions.json");

    const targets = resolveSessionStoreTargets(
      {
        session: { store: "~/.remoteclaw/agents/{agentId}/sessions/sessions.json" },
      },
      { allAgents: true },
    );

    expect(targets).toEqual([
      { agentId: "alpha", storePath: "/tmp/alpha-sessions.json" },
      { agentId: "beta", storePath: "/tmp/beta-sessions.json" },
    ]);
  });

  it("dedupes shared store paths for --all-agents", () => {
    listAgentIdsMock.mockReturnValue(["alpha", "beta"]);
    resolveStorePathMock.mockReturnValue("/tmp/shared-sessions.json");

    const targets = resolveSessionStoreTargets(
      {
        session: { store: "/tmp/shared-sessions.json" },
      },
      { allAgents: true },
    );

    expect(targets).toEqual([{ agentId: "alpha", storePath: "/tmp/shared-sessions.json" }]);
    expect(resolveStorePathMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown agent ids", () => {
    listAgentIdsMock.mockReturnValue(["alpha", "beta"]);
    expect(() => resolveSessionStoreTargets({}, { agent: "ghost" })).toThrow(/Unknown agent id/);
  });

  it("rejects conflicting selectors", () => {
    expect(() => resolveSessionStoreTargets({}, { agent: "alpha", allAgents: true })).toThrow(
      /cannot be used together/i,
    );
    expect(() =>
      resolveSessionStoreTargets({}, { store: "/tmp/sessions.json", allAgents: true }),
    ).toThrow(/cannot be combined/i);
  });
});
