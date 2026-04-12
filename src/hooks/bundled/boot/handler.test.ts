import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalHookEvent } from "../../internal-hooks.js";

const runBootOnce = vi.fn();
const listAgentIds = vi.fn();
const resolveAgentConfig = vi.fn();
const resolveAgentWorkspaceDir = vi.fn();
const mockDeps = { mock: "deps" };
const logWarn = vi.fn();
const logDebug = vi.fn();
const ALPHA_WORKSPACE_DIR = path.join(path.sep, "ws", "alpha");
const OPS_WORKSPACE_DIR = path.join(path.sep, "ws", "ops");

vi.mock("../../../gateway/boot.js", () => ({ runBootOnce }));
vi.mock("../../../agents/agent-scope.js", () => ({
  listAgentIds,
  resolveAgentConfig,
  resolveAgentWorkspaceDir,
  resolveAgentRuntime: () => "claude",
}));
vi.mock("../../../cli/deps.js", () => ({
  createDefaultDeps: () => mockDeps,
}));
vi.mock("../../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    warn: logWarn,
    debug: logDebug,
  }),
}));

const { default: runBootChecklist } = await import("./handler.js");

function makeEvent(overrides?: Partial<InternalHookEvent>): InternalHookEvent {
  return {
    type: "gateway",
    action: "startup",
    sessionKey: "test",
    context: {},
    timestamp: new Date(),
    messages: [],
    ...overrides,
  };
}

describe("boot handler", () => {
  function setupTwoAgentBootConfig() {
    const cfg = {
      agents: {
        defaults: { boot: { prompt: "Default boot" } },
        list: [{ id: "alpha" }, { id: "ops" }],
      },
    };
    listAgentIds.mockReturnValue(["alpha", "ops"]);
    resolveAgentConfig.mockReturnValue(undefined);
    resolveAgentWorkspaceDir.mockImplementation((_cfg: unknown, id: string) =>
      id === "alpha" ? ALPHA_WORKSPACE_DIR : OPS_WORKSPACE_DIR,
    );
    return cfg;
  }

  function setupSingleAgentBootConfig(cfg: unknown) {
    listAgentIds.mockReturnValue(["alpha"]);
    resolveAgentConfig.mockReturnValue(undefined);
    resolveAgentWorkspaceDir.mockReturnValue(ALPHA_WORKSPACE_DIR);
    return cfg;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips non-gateway events", async () => {
    await runBootChecklist(makeEvent({ type: "command", action: "new" }));
    expect(runBootOnce).not.toHaveBeenCalled();
  });

  it("skips non-startup actions", async () => {
    await runBootChecklist(makeEvent({ action: "shutdown" }));
    expect(runBootOnce).not.toHaveBeenCalled();
  });

  it("skips when cfg is missing from context", async () => {
    await runBootChecklist(makeEvent({ context: { workspaceDir: "/tmp" } }));
    expect(runBootOnce).not.toHaveBeenCalled();
  });

  it("runs boot for each agent", async () => {
    const cfg = setupTwoAgentBootConfig();
    runBootOnce.mockResolvedValue({ status: "ran" });

    await runBootChecklist(makeEvent({ context: { cfg } }));

    expect(listAgentIds).toHaveBeenCalledWith(cfg);
    expect(runBootOnce).toHaveBeenCalledTimes(2);
    expect(runBootOnce).toHaveBeenCalledWith({
      cfg,
      deps: mockDeps,
      workspaceDir: ALPHA_WORKSPACE_DIR,
      agentId: "alpha",
    });
    expect(runBootOnce).toHaveBeenCalledWith({
      cfg,
      deps: mockDeps,
      workspaceDir: OPS_WORKSPACE_DIR,
      agentId: "ops",
    });
  });

  it("uses per-agent boot config when available", async () => {
    const cfg = {
      agents: {
        defaults: { boot: { prompt: "Default boot" } },
        list: [{ id: "alpha" }, { id: "ops", boot: { prompt: "Ops-specific boot" } }],
      },
    };
    listAgentIds.mockReturnValue(["alpha", "ops"]);
    resolveAgentConfig.mockImplementation((_cfg: unknown, id: string) =>
      id === "ops" ? { boot: { prompt: "Ops-specific boot" } } : undefined,
    );
    resolveAgentWorkspaceDir.mockImplementation((_cfg: unknown, id: string) =>
      id === "alpha" ? ALPHA_WORKSPACE_DIR : OPS_WORKSPACE_DIR,
    );
    runBootOnce.mockResolvedValue({ status: "ran" });

    await runBootChecklist(makeEvent({ context: { cfg } }));

    expect(runBootOnce).toHaveBeenCalledWith({
      cfg,
      deps: mockDeps,
      workspaceDir: ALPHA_WORKSPACE_DIR,
      agentId: "alpha",
    });
    expect(runBootOnce).toHaveBeenCalledWith({
      cfg,
      deps: mockDeps,
      workspaceDir: OPS_WORKSPACE_DIR,
      agentId: "ops",
    });
  });

  it("runs boot for single default agent when no agents configured", async () => {
    const cfg = setupSingleAgentBootConfig({});
    runBootOnce.mockResolvedValue({ status: "skipped", reason: "not-configured" });

    await runBootChecklist(makeEvent({ context: { cfg } }));

    expect(runBootOnce).toHaveBeenCalledTimes(1);
    expect(runBootOnce).toHaveBeenCalledWith(
      expect.objectContaining({ cfg, workspaceDir: ALPHA_WORKSPACE_DIR, agentId: "alpha" }),
    );
  });

  it("logs warning details when a per-agent boot run fails", async () => {
    const cfg = setupTwoAgentBootConfig();
    runBootOnce
      .mockResolvedValueOnce({ status: "ran" })
      .mockResolvedValueOnce({ status: "failed", reason: "agent failed" });

    await runBootChecklist(makeEvent({ context: { cfg } }));

    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith("boot failed for agent startup run", {
      agentId: "ops",
      workspaceDir: OPS_WORKSPACE_DIR,
      reason: "agent failed",
    });
  });

  it("logs debug details when a per-agent boot run is skipped", async () => {
    const cfg = setupSingleAgentBootConfig({ agents: { list: [{ id: "alpha" }] } });
    runBootOnce.mockResolvedValue({ status: "skipped", reason: "not-configured" });

    await runBootChecklist(makeEvent({ context: { cfg } }));

    expect(logDebug).toHaveBeenCalledWith("boot skipped for agent startup run", {
      agentId: "alpha",
      workspaceDir: ALPHA_WORKSPACE_DIR,
      reason: "not-configured",
    });
  });
});
