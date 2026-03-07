import { beforeEach, describe, expect, it, vi } from "vitest";

const getActivePluginRegistryMock = vi.fn();
const loadConfigMock = vi.fn();
const resolveAgentWorkspaceDirOrNullMock = vi.fn();
const resolveDefaultAgentIdMock = vi.fn();
const loadRemoteClawPluginsMock = vi.fn();

vi.mock("../plugins/runtime.js", () => ({
  getActivePluginRegistry: getActivePluginRegistryMock,
}));

vi.mock("../config/config.js", () => ({
  loadConfig: loadConfigMock,
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDirOrNull: resolveAgentWorkspaceDirOrNullMock,
  resolveDefaultAgentId: resolveDefaultAgentIdMock,
}));

vi.mock("../plugins/loader.js", () => ({
  loadRemoteClawPlugins: loadRemoteClawPluginsMock,
}));

vi.mock("../logging.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("ensurePluginRegistryLoaded", () => {
  let ensurePluginRegistryLoaded: typeof import("./plugin-registry.js").ensurePluginRegistryLoaded;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ ensurePluginRegistryLoaded } = await import("./plugin-registry.js"));
    getActivePluginRegistryMock.mockReturnValue(null);
    loadConfigMock.mockReturnValue({});
    resolveDefaultAgentIdMock.mockReturnValue("main");
  });

  it("does not throw when no workspace is configured (fresh install)", () => {
    resolveAgentWorkspaceDirOrNullMock.mockReturnValue(null);

    expect(() => ensurePluginRegistryLoaded()).not.toThrow();
    expect(loadRemoteClawPluginsMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceDir: undefined }),
    );
  });

  it("passes resolved workspace to plugin loader", () => {
    resolveAgentWorkspaceDirOrNullMock.mockReturnValue("/home/user/workspace");

    ensurePluginRegistryLoaded();

    expect(loadRemoteClawPluginsMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceDir: "/home/user/workspace" }),
    );
  });

  it("skips loading when a pre-seeded registry with plugins exists", () => {
    getActivePluginRegistryMock.mockReturnValue({
      plugins: [{ id: "test" }],
      channels: [],
      tools: [],
    });

    ensurePluginRegistryLoaded();

    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(loadRemoteClawPluginsMock).not.toHaveBeenCalled();
  });

  it("loads plugins when active registry is empty", () => {
    getActivePluginRegistryMock.mockReturnValue({
      plugins: [],
      channels: [],
      tools: [],
    });
    resolveAgentWorkspaceDirOrNullMock.mockReturnValue(null);

    ensurePluginRegistryLoaded();

    expect(loadRemoteClawPluginsMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload on subsequent calls", () => {
    resolveAgentWorkspaceDirOrNullMock.mockReturnValue(null);

    ensurePluginRegistryLoaded();
    ensurePluginRegistryLoaded();

    expect(loadRemoteClawPluginsMock).toHaveBeenCalledTimes(1);
  });
});
