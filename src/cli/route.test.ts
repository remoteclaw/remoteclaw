import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emitCliBannerMock = vi.hoisted(() => vi.fn());
const ensureConfigReadyMock = vi.hoisted(() => vi.fn(async () => {}));
const ensurePluginRegistryLoadedMock = vi.hoisted(() => vi.fn());
const findRoutedCommandMock = vi.hoisted(() => vi.fn());
const runRouteMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock("./banner.js", () => ({
  emitCliBanner: emitCliBannerMock,
}));

vi.mock("./program/config-guard.js", () => ({
  ensureConfigReady: ensureConfigReadyMock,
}));

vi.mock("./plugin-registry.js", () => ({
  ensurePluginRegistryLoaded: ensurePluginRegistryLoadedMock,
}));

vi.mock("./program/routes.js", () => ({
  findRoutedCommand: findRoutedCommandMock,
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    error: vi.fn(),
    log: vi.fn(),
    writeStdout: vi.fn(),
    writeJson: vi.fn(),
    exit: vi.fn(),
  },
}));

describe("tryRouteCli", () => {
  let tryRouteCli: typeof import("./route.js").tryRouteCli;
  // After vi.resetModules(), reimported modules get fresh loggingState.
  // Capture the same reference that route.js uses.
  let loggingState: typeof import("../logging/state.js").loggingState;
  let originalDisableRouteFirst: string | undefined;
  let originalForceStderr: boolean;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalDisableRouteFirst = process.env.REMOTECLAW_DISABLE_ROUTE_FIRST;
    delete process.env.REMOTECLAW_DISABLE_ROUTE_FIRST;
    vi.resetModules();
    ({ tryRouteCli } = await import("./route.js"));
    ({ loggingState } = await import("../logging/state.js"));
    originalForceStderr = loggingState.forceConsoleToStderr;
    loggingState.forceConsoleToStderr = false;
    findRoutedCommandMock.mockReturnValue({
      loadPlugins: true,
      run: runRouteMock,
    });
  });

  afterEach(() => {
    if (loggingState) {
      loggingState.forceConsoleToStderr = originalForceStderr;
    }
    if (originalDisableRouteFirst === undefined) {
      delete process.env.REMOTECLAW_DISABLE_ROUTE_FIRST;
    } else {
      process.env.REMOTECLAW_DISABLE_ROUTE_FIRST = originalDisableRouteFirst;
    }
  });

  it("passes suppressDoctorStdout=true for routed --json commands", async () => {
    await expect(tryRouteCli(["node", "remoteclaw", "status", "--json"])).resolves.toBe(true);

    expect(ensureConfigReadyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commandPath: ["status"],
        suppressDoctorStdout: true,
      }),
    );
    expect(ensurePluginRegistryLoadedMock).toHaveBeenCalledWith({ scope: "channels" });
  });

  it("does not pass suppressDoctorStdout for routed non-json commands", async () => {
    await expect(tryRouteCli(["node", "remoteclaw", "status"])).resolves.toBe(true);

    expect(ensureConfigReadyMock).toHaveBeenCalledWith({
      runtime: expect.any(Object),
      commandPath: ["status"],
    });
    expect(ensurePluginRegistryLoadedMock).toHaveBeenCalledWith({ scope: "channels" });
  });

  it("routes logs to stderr during plugin loading in --json mode and restores after", async () => {
    findRoutedCommandMock.mockReturnValue({
      loadPlugins: true,
      run: runRouteMock,
    });

    // Capture the value inside the mock callback using the same loggingState
    // reference that route.js sees (both imported after vi.resetModules()).
    const captured: boolean[] = [];
    ensurePluginRegistryLoadedMock.mockImplementation(() => {
      captured.push(loggingState.forceConsoleToStderr);
    });

    await tryRouteCli(["node", "remoteclaw", "agents", "--json"]);

    expect(ensurePluginRegistryLoadedMock).toHaveBeenCalled();
    expect(captured[0]).toBe(true);
    expect(loggingState.forceConsoleToStderr).toBe(false);
  });

  it("does not route logs to stderr during plugin loading without --json", async () => {
    findRoutedCommandMock.mockReturnValue({
      loadPlugins: true,
      run: runRouteMock,
    });

    const captured: boolean[] = [];
    ensurePluginRegistryLoadedMock.mockImplementation(() => {
      captured.push(loggingState.forceConsoleToStderr);
    });

    await tryRouteCli(["node", "remoteclaw", "agents"]);

    expect(ensurePluginRegistryLoadedMock).toHaveBeenCalled();
    expect(captured[0]).toBe(false);
    expect(loggingState.forceConsoleToStderr).toBe(false);
  });

  it("routes status when root options precede the command", async () => {
    await expect(
      tryRouteCli(["node", "remoteclaw", "--log-level", "debug", "status"]),
    ).resolves.toBe(true);

    expect(findRoutedCommandMock).toHaveBeenCalledWith(["status"]);
    expect(ensureConfigReadyMock).toHaveBeenCalledWith({
      runtime: expect.any(Object),
      commandPath: ["status"],
    });
    expect(ensurePluginRegistryLoadedMock).toHaveBeenCalledWith({ scope: "channels" });
  });
});
