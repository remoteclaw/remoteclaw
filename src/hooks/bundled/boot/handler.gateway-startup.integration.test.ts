import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import type { CliDeps } from "../../../cli/deps.js";
import type { RemoteClawConfig } from "../../../config/config.js";

const runBootOnce = vi.fn();

vi.mock("../../../gateway/boot.js", () => ({ runBootOnce }));
vi.mock("../../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

const { default: runBootChecklist } = await import("./handler.js");
const { clearInternalHooks, createInternalHookEvent, registerInternalHook, triggerInternalHook } =
  await import("../../internal-hooks.js");

describe("boot startup hook integration", () => {
  beforeEach(() => {
    runBootOnce.mockClear();
    clearInternalHooks();
  });

  afterEach(() => {
    clearInternalHooks();
  });

  it("dispatches gateway:startup through internal hooks and runs boot for each configured agent scope", async () => {
    const bootConfig = { prompt: "Check inbox and summarize" };
    const cfg = {
      hooks: { internal: { enabled: true } },
      agents: {
        defaults: { boot: bootConfig },
        list: [
          { id: "alpha", workspace: "/ws/alpha" },
          { id: "ops", workspace: "/ws/ops" },
        ],
      },
    } as RemoteClawConfig;
    const deps = {} as CliDeps;
    runBootOnce.mockResolvedValue({ status: "ran" });

    registerInternalHook("gateway:startup", runBootChecklist);
    const event = createInternalHookEvent("gateway", "startup", "gateway:startup", { cfg, deps });
    await triggerInternalHook(event);

    const alphaWorkspaceDir = resolveAgentWorkspaceDir(cfg, "alpha");
    const opsWorkspaceDir = resolveAgentWorkspaceDir(cfg, "ops");

    expect(runBootOnce).toHaveBeenCalledTimes(2);
    expect(runBootOnce).toHaveBeenNthCalledWith(1, {
      cfg,
      deps,
      workspaceDir: alphaWorkspaceDir,
      agentId: "alpha",
    });
    expect(runBootOnce).toHaveBeenNthCalledWith(2, {
      cfg,
      deps,
      workspaceDir: opsWorkspaceDir,
      agentId: "ops",
    });
  });
});
