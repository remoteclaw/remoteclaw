import { beforeEach, describe, expect, it, vi } from "vitest";

const agentSpy = vi.fn(async () => ({ runId: "run-main", status: "ok" }));
const sessionsDeleteSpy = vi.fn();
const readLatestAssistantReplyMock = vi.fn(async () => "raw subagent reply");
let sessionStore: Record<string, Record<string, unknown>> = {};
let configOverride: ReturnType<(typeof import("../config/config.js"))["loadConfig"]> = {
  session: {
    mainKey: "main",
    scope: "per-sender",
  },
};

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(async (req: unknown) => {
    const typed = req as { method?: string; params?: { message?: string; sessionKey?: string } };
    if (typed.method === "agent") {
      return await agentSpy(typed);
    }
    if (typed.method === "agent.wait") {
      return { status: "error", startedAt: 10, endedAt: 20, error: "boom" };
    }
    if (typed.method === "sessions.patch") {
      return {};
    }
    if (typed.method === "sessions.delete") {
      sessionsDeleteSpy(typed);
      return {};
    }
    return {};
  }),
}));

vi.mock("./tools/agent-step.js", () => ({
  readLatestAssistantReply: readLatestAssistantReplyMock,
}));

vi.mock("../config/sessions.js", () => ({
  loadSessionStore: vi.fn(() => sessionStore),
  resolveAgentIdFromSessionKey: () => "main",
  resolveStorePath: () => "/tmp/sessions.json",
  resolveMainSessionKey: () => "agent:main:main",
  readSessionUpdatedAt: vi.fn(() => undefined),
  recordSessionMetaFromInbound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configOverride,
  };
});

describe("subagent announce formatting", () => {
  beforeEach(() => {
    agentSpy.mockClear();
    sessionsDeleteSpy.mockClear();
    readLatestAssistantReplyMock.mockReset().mockResolvedValue("raw subagent reply");
    sessionStore = {};
    configOverride = {
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
    };
  });

  it("sends instructional message to main agent with status and findings", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-123",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: true,
      startedAt: 10,
      endedAt: 20,
    });

    expect(agentSpy).toHaveBeenCalled();
    const call = agentSpy.mock.calls[0]?.[0] as {
      params?: { message?: string; sessionKey?: string };
    };
    const msg = call?.params?.message as string;
    expect(call?.params?.sessionKey).toBe("agent:main:main");
    expect(msg).toContain("subagent task");
    expect(msg).toContain("failed");
    expect(msg).toContain("boom");
    expect(msg).toContain("Findings:");
    expect(msg).toContain("raw subagent reply");
    expect(msg).toContain("Stats:");
  });

  it("includes success status when outcome is ok", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    // Use waitForCompletion: false so it uses the provided outcome instead of calling agent.wait
    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-456",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    const call = agentSpy.mock.calls[0]?.[0] as { params?: { message?: string } };
    const msg = call?.params?.message as string;
    expect(msg).toContain("completed successfully");
  });

  // pi-embedded: removed tests for steer/collect/queue paths (dead code after AgentRuntime migration)

  it("uses requester origin for direct announce when not queued", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-direct",
      requesterSessionKey: "agent:main:main",
      requesterOrigin: { channel: "whatsapp", accountId: "acct-123" },
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    expect(didAnnounce).toBe(true);
    const call = agentSpy.mock.calls[0]?.[0] as { params?: Record<string, unknown> };
    expect(call?.params?.channel).toBe("whatsapp");
    expect(call?.params?.accountId).toBe("acct-123");
  });

  // pi-embedded: removed tests for settling/deferring on active runs (dead code after AgentRuntime migration)

  it("normalizes requesterOrigin for direct announce delivery", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-direct-origin",
      requesterSessionKey: "agent:main:main",
      requesterOrigin: { channel: " whatsapp ", accountId: " acct-987 " },
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    expect(didAnnounce).toBe(true);
    const call = agentSpy.mock.calls[0]?.[0] as { params?: Record<string, unknown> };
    expect(call?.params?.channel).toBe("whatsapp");
    expect(call?.params?.accountId).toBe("acct-987");
  });

  // pi-embedded: removed tests for queued announce with origin/channel/accountId routing (dead code after AgentRuntime migration)
});
