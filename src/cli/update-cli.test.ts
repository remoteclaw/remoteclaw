import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig, ConfigFileSnapshot } from "../config/types.remoteclaw.js";
import { withEnvAsync } from "../test-utils/env.js";

const confirm = vi.fn();
const select = vi.fn();
const spinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
const isCancel = (value: unknown) => value === "cancel";

const readPackageName = vi.fn();
const readPackageVersion = vi.fn();
const resolveGlobalManager = vi.fn();
const serviceLoaded = vi.fn();
const prepareRestartScript = vi.fn();
const runRestartScript = vi.fn();
const mockedRunDaemonInstall = vi.fn();
const serviceReadRuntime = vi.fn();
const inspectPortUsage = vi.fn();
const classifyPortListener = vi.fn();
const formatPortDiagnostics = vi.fn();
const pathExists = vi.fn();
const syncPluginsForUpdateChannel = vi.fn();
const updateNpmInstalledPlugins = vi.fn();

vi.mock("@clack/prompts", () => ({
  confirm,
  select,
  isCancel,
  spinner,
}));

vi.mock("../infra/remoteclaw-root.js", () => ({
  resolveRemoteClawPackageRoot: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  readConfigFileSnapshot: vi.fn(),
  resolveGatewayPort: vi.fn(() => 18789),
  writeConfigFile: vi.fn(),
}));

vi.mock("../infra/update-check.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/update-check.js")>();
  return {
    ...actual,
    checkUpdateStatus: vi.fn(),
    fetchNpmTagVersion: vi.fn(),
    resolveNpmChannelTag: vi.fn(),
  };
});

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawnSync: vi.fn(() => ({
      pid: 0,
      output: [],
      stdout: "",
      stderr: "",
      status: 0,
      signal: null,
    })),
  };
});

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: vi.fn(),
}));

vi.mock("../utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils.js")>();
  return {
    ...actual,
    pathExists: (...args: unknown[]) => pathExists(...args),
  };
});

vi.mock("../plugins/update.js", () => ({
  syncPluginsForUpdateChannel: (...args: unknown[]) => syncPluginsForUpdateChannel(...args),
  updateNpmInstalledPlugins: (...args: unknown[]) => updateNpmInstalledPlugins(...args),
}));

vi.mock("./update-cli/shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./update-cli/shared.js")>();
  return {
    ...actual,
    readPackageName,
    readPackageVersion,
    resolveGlobalManager,
  };
});

vi.mock("../daemon/service.js", () => ({
  resolveGatewayService: vi.fn(() => ({
    isLoaded: (...args: unknown[]) => serviceLoaded(...args),
    readRuntime: (...args: unknown[]) => serviceReadRuntime(...args),
  })),
}));

vi.mock("../infra/ports.js", () => ({
  inspectPortUsage: (...args: unknown[]) => inspectPortUsage(...args),
  classifyPortListener: (...args: unknown[]) => classifyPortListener(...args),
  formatPortDiagnostics: (...args: unknown[]) => formatPortDiagnostics(...args),
}));

vi.mock("./update-cli/restart-helper.js", () => ({
  prepareRestartScript: (...args: unknown[]) => prepareRestartScript(...args),
  runRestartScript: (...args: unknown[]) => runRestartScript(...args),
}));

// Mock doctor (heavy module; should not run in unit tests)
vi.mock("../commands/doctor.js", () => ({
  doctorCommand: vi.fn(),
}));
// Mock the daemon-cli module
vi.mock("./daemon-cli.js", () => ({
  runDaemonInstall: mockedRunDaemonInstall,
  runDaemonRestart: vi.fn(),
}));

// Mock the runtime
vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  },
}));

const { resolveRemoteClawPackageRoot } = await import("../infra/remoteclaw-root.js");
const { readConfigFileSnapshot, writeConfigFile } = await import("../config/config.js");
const { checkUpdateStatus, fetchNpmTagVersion, resolveNpmChannelTag } =
  await import("../infra/update-check.js");
const { runCommandWithTimeout } = await import("../process/exec.js");
const { runDaemonRestart, runDaemonInstall } = await import("./daemon-cli.js");
const { doctorCommand } = await import("../commands/doctor.js");
const { defaultRuntime } = await import("../runtime.js");
const { updateCommand, updateStatusCommand, updateWizardCommand } = await import("./update-cli.js");

describe("update-cli", () => {
  const fixtureRoot = "/tmp/remoteclaw-update-tests";
  let fixtureCount = 0;

  const createCaseDir = (prefix: string) => {
    const dir = path.join(fixtureRoot, `${prefix}-${fixtureCount++}`);
    // Tests only need a stable path; the directory does not have to exist because all I/O is mocked.
    return dir;
  };

  const baseConfig = {} as RemoteClawConfig;
  const baseSnapshot: ConfigFileSnapshot = {
    path: "/tmp/remoteclaw-config.json",
    exists: true,
    raw: "{}",
    parsed: {},
    resolved: baseConfig,
    valid: true,
    config: baseConfig,
    issues: [],
    warnings: [],
    legacyIssues: [],
  };

  const setTty = (value: boolean | undefined) => {
    Object.defineProperty(process.stdin, "isTTY", {
      value,
      configurable: true,
    });
  };

  const setStdoutTty = (value: boolean | undefined) => {
    Object.defineProperty(process.stdout, "isTTY", {
      value,
      configurable: true,
    });
  };

  const mockPackageInstallStatus = (root: string) => {
    vi.mocked(resolveRemoteClawPackageRoot).mockResolvedValue(root);
    vi.mocked(checkUpdateStatus).mockResolvedValue({
      root,
      installKind: "package",
      packageManager: "npm",
      deps: {
        manager: "npm",
        status: "ok",
        lockfilePath: null,
        markerPath: null,
      },
    });
  };

  const runRestartFallbackScenario = async (params: { daemonInstall: "ok" | "fail" }) => {
    if (params.daemonInstall === "fail") {
      vi.mocked(runDaemonInstall).mockRejectedValueOnce(new Error("refresh failed"));
    } else {
      vi.mocked(runDaemonInstall).mockResolvedValue(undefined);
    }
    prepareRestartScript.mockResolvedValue(null);
    serviceLoaded.mockResolvedValue(true);
    vi.mocked(runDaemonRestart).mockResolvedValue(true);

    await updateCommand({});

    expect(runDaemonInstall).toHaveBeenCalledWith({
      force: true,
      json: undefined,
    });
    expect(runDaemonRestart).toHaveBeenCalled();
  };

  const setupNonInteractiveDowngrade = async () => {
    const tempDir = createCaseDir("remoteclaw-update");
    setTty(false);
    readPackageVersion.mockResolvedValue("2.0.0");

    mockPackageInstallStatus(tempDir);
    vi.mocked(resolveNpmChannelTag).mockResolvedValue({
      tag: "latest",
      version: "0.0.1",
    });
    vi.mocked(defaultRuntime.error).mockClear();
    vi.mocked(defaultRuntime.exit).mockClear();

    return tempDir;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveRemoteClawPackageRoot).mockResolvedValue(process.cwd());
    vi.mocked(readConfigFileSnapshot).mockResolvedValue(baseSnapshot);
    vi.mocked(fetchNpmTagVersion).mockResolvedValue({
      tag: "latest",
      version: "9999.0.0",
    });
    vi.mocked(resolveNpmChannelTag).mockResolvedValue({
      tag: "latest",
      version: "9999.0.0",
    });
    vi.mocked(checkUpdateStatus).mockResolvedValue({
      root: "/test/path",
      installKind: "git",
      packageManager: "pnpm",
      git: {
        root: "/test/path",
        sha: "abcdef1234567890",
        tag: "v1.2.3",
        branch: "main",
        upstream: "origin/main",
        dirty: false,
        ahead: 0,
        behind: 0,
        fetchOk: true,
      },
      deps: {
        manager: "pnpm",
        status: "ok",
        lockfilePath: "/test/path/pnpm-lock.yaml",
        markerPath: "/test/path/node_modules",
      },
      registry: {
        latestVersion: "1.2.3",
      },
    });
    vi.mocked(runCommandWithTimeout).mockResolvedValue({
      stdout: "",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
      termination: "exit",
    });
    readPackageName.mockResolvedValue("remoteclaw");
    readPackageVersion.mockResolvedValue("1.0.0");
    resolveGlobalManager.mockResolvedValue("npm");
    serviceLoaded.mockResolvedValue(false);
    serviceReadRuntime.mockResolvedValue({
      status: "running",
      pid: 4242,
      state: "running",
    });
    prepareRestartScript.mockResolvedValue("/tmp/remoteclaw-restart-test.sh");
    runRestartScript.mockResolvedValue(undefined);
    inspectPortUsage.mockResolvedValue({
      port: 18789,
      status: "busy",
      listeners: [{ pid: 4242, command: "remoteclaw-gateway" }],
      hints: [],
    });
    classifyPortListener.mockReturnValue("gateway");
    formatPortDiagnostics.mockReturnValue(["Port 18789 is already in use."]);
    pathExists.mockResolvedValue(false);
    syncPluginsForUpdateChannel.mockResolvedValue({
      changed: false,
      config: baseConfig,
      summary: {
        switchedToBundled: [],
        switchedToNpm: [],
        warnings: [],
        errors: [],
      },
    });
    updateNpmInstalledPlugins.mockResolvedValue({
      changed: false,
      config: baseConfig,
      outcomes: [],
    });
    vi.mocked(runDaemonInstall).mockResolvedValue(undefined);
    vi.mocked(runDaemonRestart).mockResolvedValue(true);
    vi.mocked(doctorCommand).mockResolvedValue(undefined);
    confirm.mockResolvedValue(false);
    select.mockResolvedValue("stable");
    setTty(false);
    setStdoutTty(false);
  });

  it("updateCommand --dry-run previews without mutating", async () => {
    vi.mocked(defaultRuntime.log).mockClear();
    serviceLoaded.mockResolvedValue(true);

    await updateCommand({ dryRun: true, channel: "beta" });

    expect(writeConfigFile).not.toHaveBeenCalled();
    expect(runDaemonInstall).not.toHaveBeenCalled();
    expect(runRestartScript).not.toHaveBeenCalled();
    expect(runDaemonRestart).not.toHaveBeenCalled();

    const logs = vi.mocked(defaultRuntime.log).mock.calls.map((call) => String(call[0]));
    expect(logs.join("\n")).toContain("Update dry-run");
    expect(logs.join("\n")).toContain("No changes were applied.");
  });

  it("updateStatusCommand prints table output", async () => {
    await updateStatusCommand({ json: false });

    const logs = vi.mocked(defaultRuntime.log).mock.calls.map((call) => call[0]);
    expect(logs.join("\n")).toContain("RemoteClaw update status");
  });

  it("updateStatusCommand emits JSON", async () => {
    await updateStatusCommand({ json: true });

    const last = vi.mocked(defaultRuntime.log).mock.calls.at(-1)?.[0];
    expect(typeof last).toBe("string");
    const parsed = JSON.parse(String(last));
    expect(parsed.channel.value).toBe("next");
  });

  it("defaults to next channel when unset", async () => {
    const tempDir = createCaseDir("remoteclaw-update");
    mockPackageInstallStatus(tempDir);

    await updateCommand({});

    // Default channel is next, resolved via resolveNpmChannelTag
    expect(resolveNpmChannelTag).toHaveBeenCalled();
  });

  it("uses stored beta channel when configured", async () => {
    vi.mocked(readConfigFileSnapshot).mockResolvedValue({
      ...baseSnapshot,
      config: { update: { channel: "beta" } } as RemoteClawConfig,
    });

    await updateCommand({});

    expect(resolveNpmChannelTag).toHaveBeenCalledWith(expect.objectContaining({ channel: "beta" }));
  });

  it("falls back to latest when beta tag is older than release", async () => {
    const tempDir = createCaseDir("remoteclaw-update");

    mockPackageInstallStatus(tempDir);
    vi.mocked(readConfigFileSnapshot).mockResolvedValue({
      ...baseSnapshot,
      config: { update: { channel: "beta" } } as RemoteClawConfig,
    });
    vi.mocked(resolveNpmChannelTag).mockResolvedValue({
      tag: "latest",
      version: "1.2.3-1",
    });

    await updateCommand({});

    expect(resolveNpmChannelTag).toHaveBeenCalledWith(expect.objectContaining({ channel: "beta" }));
  });

  it("honors --tag override", async () => {
    const tempDir = createCaseDir("remoteclaw-update");
    vi.mocked(resolveRemoteClawPackageRoot).mockResolvedValue(tempDir);

    await updateCommand({ tag: "next" });

    // With a tag override, resolveTargetVersion is used instead of resolveNpmChannelTag
    expect(fetchNpmTagVersion).toHaveBeenCalled();
  });

  it("updateCommand outputs JSON when --json is set", async () => {
    vi.mocked(defaultRuntime.log).mockClear();

    await updateCommand({ json: true });

    const logCalls = vi.mocked(defaultRuntime.log).mock.calls;
    const jsonOutput = logCalls.find((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonOutput).toBeDefined();
  });

  it("updateCommand exits with error on failure", async () => {
    vi.mocked(runCommandWithTimeout).mockResolvedValue({
      stdout: "",
      stderr: "install failed",
      code: 1,
      signal: null,
      killed: false,
      termination: "exit",
    });
    vi.mocked(defaultRuntime.exit).mockClear();

    await updateCommand({});

    expect(defaultRuntime.exit).toHaveBeenCalledWith(1);
  });

  it("updateCommand refreshes gateway service env when service is already installed", async () => {
    vi.mocked(runDaemonInstall).mockResolvedValue(undefined);
    serviceLoaded.mockResolvedValue(true);

    await updateCommand({});

    expect(runDaemonInstall).toHaveBeenCalledWith({
      force: true,
      json: undefined,
    });
    expect(runRestartScript).toHaveBeenCalled();
    expect(runDaemonRestart).not.toHaveBeenCalled();
  });

  it("updateCommand refreshes service env from updated install root when available", async () => {
    const root = createCaseDir("remoteclaw-updated-root");
    const entryPath = path.join(root, "dist", "entry.js");
    pathExists.mockImplementation(async (candidate: string) => candidate === entryPath);

    vi.mocked(resolveRemoteClawPackageRoot).mockResolvedValue(root);
    serviceLoaded.mockResolvedValue(true);

    await updateCommand({});

    expect(runCommandWithTimeout).toHaveBeenCalledWith(
      [expect.stringMatching(/node/), entryPath, "gateway", "install", "--force"],
      expect.objectContaining({ timeoutMs: 60_000 }),
    );
    expect(runDaemonInstall).not.toHaveBeenCalled();
    expect(runRestartScript).toHaveBeenCalled();
  });

  it("updateCommand falls back to restart when env refresh install fails", async () => {
    await runRestartFallbackScenario({ daemonInstall: "fail" });
  });

  it("updateCommand falls back to restart when no detached restart script is available", async () => {
    await runRestartFallbackScenario({ daemonInstall: "ok" });
  });

  it("updateCommand does not refresh service env when --no-restart is set", async () => {
    serviceLoaded.mockResolvedValue(true);

    await updateCommand({ restart: false });

    expect(runDaemonInstall).not.toHaveBeenCalled();
    expect(runRestartScript).not.toHaveBeenCalled();
    expect(runDaemonRestart).not.toHaveBeenCalled();
  });

  it("updateCommand continues after doctor sub-step and clears update flag", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      await withEnvAsync({ REMOTECLAW_UPDATE_IN_PROGRESS: undefined }, async () => {
        vi.mocked(runDaemonRestart).mockResolvedValue(true);
        vi.mocked(doctorCommand).mockResolvedValue(undefined);
        vi.mocked(defaultRuntime.log).mockClear();

        await updateCommand({});

        expect(doctorCommand).toHaveBeenCalledWith(
          defaultRuntime,
          expect.objectContaining({ nonInteractive: true }),
        );
        expect(process.env.REMOTECLAW_UPDATE_IN_PROGRESS).toBeUndefined();

        const logLines = vi.mocked(defaultRuntime.log).mock.calls.map((call) => String(call[0]));
        expect(logLines.some((line) => line.includes("Fresh code, same crab. Miss me?"))).toBe(
          true,
        );
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("updateCommand skips success message when restart does not run", async () => {
    vi.mocked(runDaemonRestart).mockResolvedValue(false);
    vi.mocked(defaultRuntime.log).mockClear();

    await updateCommand({ restart: true });

    const logLines = vi.mocked(defaultRuntime.log).mock.calls.map((call) => String(call[0]));
    expect(logLines.some((line) => line.includes("Daemon restarted successfully."))).toBe(false);
  });

  it.each([
    {
      name: "update command",
      run: async () => await updateCommand({ timeout: "invalid" }),
      requireTty: false,
    },
    {
      name: "update status command",
      run: async () => await updateStatusCommand({ timeout: "invalid" }),
      requireTty: false,
    },
    {
      name: "update wizard command",
      run: async () => await updateWizardCommand({ timeout: "invalid" }),
      requireTty: true,
    },
  ])("validates timeout option for $name", async ({ run, requireTty }) => {
    setTty(requireTty);
    vi.mocked(defaultRuntime.error).mockClear();
    vi.mocked(defaultRuntime.exit).mockClear();

    await run();

    expect(defaultRuntime.error).toHaveBeenCalledWith(expect.stringContaining("timeout"));
    expect(defaultRuntime.exit).toHaveBeenCalledWith(1);
  });

  it("persists update channel when --channel is set", async () => {
    await updateCommand({ channel: "beta" });

    expect(writeConfigFile).toHaveBeenCalled();
    const call = vi.mocked(writeConfigFile).mock.calls[0]?.[0] as {
      update?: { channel?: string };
    };
    expect(call?.update?.channel).toBe("beta");
  });

  it.each([
    {
      name: "requires confirmation without --yes",
      options: {},
      shouldExit: true,
      shouldRunUpdate: false,
    },
    {
      name: "allows downgrade with --yes",
      options: { yes: true },
      shouldExit: false,
      shouldRunUpdate: true,
    },
  ])("$name in non-interactive mode", async ({ options, shouldExit, shouldRunUpdate }) => {
    await setupNonInteractiveDowngrade();
    await updateCommand(options);

    const downgradeMessageSeen = vi
      .mocked(defaultRuntime.error)
      .mock.calls.some((call) => String(call[0]).includes("Downgrade confirmation required."));
    expect(downgradeMessageSeen).toBe(shouldExit);
    expect(vi.mocked(defaultRuntime.exit).mock.calls.some((call) => call[0] === 1)).toBe(
      shouldExit,
    );
    // When shouldRunUpdate is true, the command proceeds past downgrade check
    expect(vi.mocked(runCommandWithTimeout).mock.calls.length > 0).toBe(shouldRunUpdate);
  });

  it("dry-run bypasses downgrade confirmation checks in non-interactive mode", async () => {
    await setupNonInteractiveDowngrade();
    vi.mocked(defaultRuntime.exit).mockClear();

    await updateCommand({ dryRun: true });

    expect(vi.mocked(defaultRuntime.exit).mock.calls.some((call) => call[0] === 1)).toBe(false);
    expect(runCommandWithTimeout).not.toHaveBeenCalled();
  });

  it("updateWizardCommand requires a TTY", async () => {
    setTty(false);
    vi.mocked(defaultRuntime.error).mockClear();
    vi.mocked(defaultRuntime.exit).mockClear();

    await updateWizardCommand({});

    expect(defaultRuntime.error).toHaveBeenCalledWith(
      expect.stringContaining("Update wizard requires a TTY"),
    );
    expect(defaultRuntime.exit).toHaveBeenCalledWith(1);
  });

  it("updateWizardCommand forwards channel selection to updateCommand", async () => {
    setTty(true);

    select.mockResolvedValue("next");
    confirm.mockResolvedValue(false);

    await updateWizardCommand({});

    // The wizard passes the channel through to updateCommand
    expect(resolveNpmChannelTag).toHaveBeenCalledWith(expect.objectContaining({ channel: "next" }));
  });
});
