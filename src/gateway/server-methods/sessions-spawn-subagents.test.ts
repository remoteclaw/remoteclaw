import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandlerOptions, RespondFn } from "./types.js";

// ── Mocks ──────────────────────────────────────────────────────────────

const spawnSubagentDirectMock = vi.fn();
vi.mock("../../agents/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../agents/bootstrap-cache.js", () => ({
  clearBootstrapSnapshot: vi.fn(),
}));

vi.mock("../../auto-reply/reply/abort.js", () => ({
  stopSubagentsForRequester: vi.fn(),
}));

vi.mock("../../auto-reply/reply/queue.js", () => ({
  clearSessionQueues: vi.fn().mockReturnValue({
    followupCleared: 0,
    laneCleared: 0,
    keys: [],
  }),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: () => ({
    session: { mainKey: "main" },
  }),
}));

vi.mock("../../config/sessions.js", () => ({
  loadSessionStore: vi.fn().mockReturnValue({}),
  snapshotSessionOrigin: vi.fn(),
  resolveMainSessionKey: vi.fn().mockReturnValue("main"),
  updateSessionStore: vi.fn(),
}));

vi.mock("../../discord/monitor/thread-bindings.js", () => ({
  unbindThreadBindingsBySessionKey: vi.fn(),
}));

vi.mock("../../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: vi.fn(),
  triggerInternalHook: vi.fn(),
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: vi.fn(),
}));

import {
  addSubagentRunForTests,
  resetSubagentRegistryForTests,
} from "../../agents/subagent-registry.js";
import { sessionsHandlers } from "./sessions.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeOpts(params: Record<string, unknown>): {
  respond: ReturnType<typeof vi.fn>;
  opts: GatewayRequestHandlerOptions;
} {
  const respond = vi.fn() as unknown as ReturnType<typeof vi.fn> & RespondFn;
  return {
    respond,
    opts: {
      req: { id: "req-1", type: "req" as const, method: "test" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("sessions.spawn gateway method", () => {
  beforeEach(() => {
    spawnSubagentDirectMock.mockReset();
  });

  it("rejects when task is missing", async () => {
    const { respond, opts } = makeOpts({});
    await sessionsHandlers["sessions.spawn"](opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "task is required",
      }),
    );
  });

  it("rejects when task is empty string", async () => {
    const { respond, opts } = makeOpts({ task: "  " });
    await sessionsHandlers["sessions.spawn"](opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "task is required",
      }),
    );
  });

  it("bridges to spawnSubagentDirect with correct params", async () => {
    spawnSubagentDirectMock.mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:main:subagent:abc",
      runId: "run-123",
    });

    const { respond, opts } = makeOpts({
      task: "investigate auth bug",
      agentId: "coder",
      label: "auth-investigator",
      sessionKey: "agent:main:main",
    });
    await sessionsHandlers["sessions.spawn"](opts);

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      { task: "investigate auth bug", agentId: "coder", label: "auth-investigator" },
      { agentSessionKey: "agent:main:main" },
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        status: "accepted",
        childSessionKey: "agent:main:subagent:abc",
        runId: "run-123",
      },
      undefined,
    );
  });

  it("handles spawn errors gracefully", async () => {
    spawnSubagentDirectMock.mockRejectedValue(new Error("spawn failed"));

    const { respond, opts } = makeOpts({
      task: "do stuff",
      sessionKey: "agent:main:main",
    });
    await sessionsHandlers["sessions.spawn"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "UNAVAILABLE",
        message: "spawn failed",
      }),
    );
  });

  it("passes optional params as undefined when absent", async () => {
    spawnSubagentDirectMock.mockResolvedValue({ status: "accepted" });

    const { opts } = makeOpts({ task: "run task" });
    await sessionsHandlers["sessions.spawn"](opts);

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      { task: "run task", agentId: undefined, label: undefined },
      { agentSessionKey: undefined },
    );
  });
});

describe("sessions.subagents gateway method", () => {
  beforeEach(() => {
    resetSubagentRegistryForTests();
  });

  it("rejects when sessionKey is missing", async () => {
    const { respond, opts } = makeOpts({ action: "list" });
    await sessionsHandlers["sessions.subagents"](opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "sessionKey is required",
      }),
    );
  });

  it("lists subagent runs for a session", async () => {
    const now = Date.now();
    addSubagentRunForTests({
      runId: "run-1",
      childSessionKey: "agent:main:subagent:child-1",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "investigate auth",
      cleanup: "keep",
      createdAt: now - 60_000,
      startedAt: now - 60_000,
    });

    const { respond, opts } = makeOpts({
      action: "list",
      sessionKey: "agent:main:main",
    });
    await sessionsHandlers["sessions.subagents"](opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        status: "ok",
        action: "list",
      }),
      undefined,
    );
    const payload = respond.mock.calls[0][1] as { runs: unknown[] };
    expect(payload.runs).toHaveLength(1);
  });

  it("defaults to list when action is missing", async () => {
    const { respond, opts } = makeOpts({ sessionKey: "agent:main:main" });
    await sessionsHandlers["sessions.subagents"](opts);
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        status: "ok",
        action: "list",
      }),
      undefined,
    );
  });

  it("returns status for a specific run by runId", async () => {
    const now = Date.now();
    addSubagentRunForTests({
      runId: "run-status-1",
      childSessionKey: "agent:main:subagent:status-child",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "check status",
      cleanup: "keep",
      createdAt: now,
      startedAt: now,
    });

    const { respond, opts } = makeOpts({
      action: "status",
      sessionKey: "agent:main:main",
      runId: "run-status-1",
    });
    await sessionsHandlers["sessions.subagents"](opts);

    const payload = respond.mock.calls[0][1] as {
      status: string;
      run: { runId: string } | null;
    };
    expect(payload.status).toBe("ok");
    expect(payload.run).not.toBeNull();
    expect(payload.run?.runId).toBe("run-status-1");
  });

  it("returns null for unknown runId in status action", async () => {
    const { respond, opts } = makeOpts({
      action: "status",
      sessionKey: "agent:main:main",
      runId: "nonexistent",
    });
    await sessionsHandlers["sessions.subagents"](opts);

    const payload = respond.mock.calls[0][1] as { run: unknown };
    expect(payload.run).toBeNull();
  });

  it("cancels a subagent run", async () => {
    const now = Date.now();
    addSubagentRunForTests({
      runId: "run-cancel-1",
      childSessionKey: "agent:main:subagent:cancel-child",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "cancel me",
      cleanup: "keep",
      createdAt: now,
      startedAt: now,
    });

    const { respond, opts } = makeOpts({
      action: "cancel",
      sessionKey: "agent:main:main",
      runId: "run-cancel-1",
      reason: "user requested",
    });
    await sessionsHandlers["sessions.subagents"](opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        status: "ok",
        action: "cancel",
        terminated: 1,
      }),
      undefined,
    );
  });

  it("rejects unsupported actions", async () => {
    const { respond, opts } = makeOpts({
      action: "restart",
      sessionKey: "agent:main:main",
    });
    await sessionsHandlers["sessions.subagents"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "unsupported action: restart",
      }),
    );
  });
});
