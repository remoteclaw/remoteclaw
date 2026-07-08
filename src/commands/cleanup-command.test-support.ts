import { vi } from "vitest";
import { createNonExitingRuntime, type RuntimeEnv } from "../runtime.js";
import type { MockFn } from "../test-utils/vitest-mock-fn.js";

const resolveCleanupPlanFromDisk = vi.fn();
const removePath = vi.fn();
const listAgentSessionDirs = vi.fn();
const removeStateAndLinkedPaths = vi.fn();
const removeWorkspaceDirs = vi.fn();

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

export function cleanupCommandLogMessages(runtime: RuntimeEnv): string[] {
  const calls = (runtime.log as MockFn<(...args: unknown[]) => void>).mock.calls;
  return calls.map((call) => String(call[0]));
}
