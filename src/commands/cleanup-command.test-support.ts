import { vi } from "vitest";
import { createNonExitingRuntime, type RuntimeEnv } from "../runtime.js";

export const resolveCleanupPlanFromDisk = vi.fn();
export const removePath = vi.fn();
export const listAgentSessionDirs = vi.fn();
export const removeStateAndLinkedPaths = vi.fn();
export const removeWorkspaceDirs = vi.fn();

vi.mock("../config/config.js", () => ({
  isNixMode: false,
}));

vi.mock("./cleanup-plan.js", () => ({
  resolveCleanupPlanFromDisk,
}));

vi.mock("./cleanup-utils.js", () => ({
  removePath,
  listAgentSessionDirs,
  removeStateAndLinkedPaths,
  removeWorkspaceDirs,
}));

export function createCleanupCommandRuntime() {
  return createNonExitingRuntime();
}

export function resetCleanupCommandMocks() {
  vi.clearAllMocks();
  resolveCleanupPlanFromDisk.mockReturnValue({
    stateDir: "/tmp/.remoteclaw",
    configPath: "/tmp/.remoteclaw/remoteclaw.json",
    oauthDir: "/tmp/.remoteclaw/credentials",
    configInsideState: true,
    oauthInsideState: true,
    workspaceDirs: ["/tmp/.remoteclaw/workspace"],
  });
  removePath.mockResolvedValue({ ok: true });
  listAgentSessionDirs.mockResolvedValue(["/tmp/.remoteclaw/agents/main/sessions"]);
  removeStateAndLinkedPaths.mockResolvedValue(undefined);
  removeWorkspaceDirs.mockResolvedValue(undefined);
}

export function silenceCleanupCommandRuntime(runtime: RuntimeEnv) {
  vi.spyOn(runtime, "log").mockImplementation(() => {});
  vi.spyOn(runtime, "error").mockImplementation(() => {});
}
