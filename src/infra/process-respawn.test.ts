import { afterEach, describe, expect, it, vi } from "vitest";
import { captureFullEnv } from "../test-utils/env.js";
import { SUPERVISOR_HINT_ENV_VARS } from "./supervisor-markers.js";

const spawnMock = vi.hoisted(() => vi.fn());
const triggerRemoteClawRestartMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));
vi.mock("./restart.js", () => ({
  triggerRemoteClawRestart: (...args: unknown[]) => triggerRemoteClawRestartMock(...args),
}));

import { restartGatewayProcessWithFreshPid } from "./process-respawn.js";

const originalArgv = [...process.argv];
const originalExecArgv = [...process.execArgv];
const envSnapshot = captureFullEnv();
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

function setPlatform(platform: string) {
  if (!originalPlatformDescriptor) {
    return;
  }
  Object.defineProperty(process, "platform", {
    ...originalPlatformDescriptor,
    value: platform,
  });
}

afterEach(() => {
  envSnapshot.restore();
  process.argv = [...originalArgv];
  process.execArgv = [...originalExecArgv];
  spawnMock.mockClear();
  triggerRemoteClawRestartMock.mockClear();
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, "platform", originalPlatformDescriptor);
  }
});

function clearSupervisorHints() {
  for (const key of SUPERVISOR_HINT_ENV_VARS) {
    delete process.env[key];
  }
}

function expectLaunchdKickstartSupervised(params?: { launchJobLabel?: string }) {
  setPlatform("darwin");
  if (params?.launchJobLabel) {
    process.env.LAUNCH_JOB_LABEL = params.launchJobLabel;
  }
  process.env.REMOTECLAW_LAUNCHD_LABEL = "ai.remoteclaw.gateway";
  triggerRemoteClawRestartMock.mockReturnValue({ ok: true, method: "launchctl" });
  const result = restartGatewayProcessWithFreshPid();
  expect(result.mode).toBe("supervised");
  expect(triggerRemoteClawRestartMock).toHaveBeenCalledOnce();
  expect(spawnMock).not.toHaveBeenCalled();
}

describe("restartGatewayProcessWithFreshPid", () => {
  it("returns disabled when REMOTECLAW_NO_RESPAWN is set", () => {
    process.env.REMOTECLAW_NO_RESPAWN = "1";
    const result = restartGatewayProcessWithFreshPid();
    expect(result.mode).toBe("disabled");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns supervised when launchd hints are present on macOS", () => {
    clearSupervisorHints();
    setPlatform("darwin");
    process.env.LAUNCH_JOB_LABEL = "org.remoteclaw.gateway";
    triggerRemoteClawRestartMock.mockReturnValue({ ok: true, method: "launchctl" });
    const result = restartGatewayProcessWithFreshPid();
    expect(result.mode).toBe("supervised");
    expect(triggerRemoteClawRestartMock).toHaveBeenCalledOnce();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("runs launchd kickstart helper on macOS when launchd label is set", () => {
    expectLaunchdKickstartSupervised({ launchJobLabel: "ai.remoteclaw.gateway" });
  });

  it("returns failed when launchd kickstart helper fails", () => {
    setPlatform("darwin");
    process.env.LAUNCH_JOB_LABEL = "ai.remoteclaw.gateway";
    process.env.REMOTECLAW_LAUNCHD_LABEL = "ai.remoteclaw.gateway";
    triggerRemoteClawRestartMock.mockReturnValue({
      ok: false,
      method: "launchctl",
      detail: "spawn failed",
    });

    const result = restartGatewayProcessWithFreshPid();

    expect(result.mode).toBe("failed");
    expect(result.detail).toContain("spawn failed");
  });

  it("does not schedule kickstart on non-darwin platforms", () => {
    setPlatform("linux");
    process.env.INVOCATION_ID = "abc123";
    process.env.REMOTECLAW_LAUNCHD_LABEL = "ai.remoteclaw.gateway";

    const result = restartGatewayProcessWithFreshPid();

    expect(result.mode).toBe("supervised");
    expect(triggerRemoteClawRestartMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns supervised when XPC_SERVICE_NAME is set by launchd", () => {
    clearSupervisorHints();
    setPlatform("darwin");
    process.env.XPC_SERVICE_NAME = "ai.remoteclaw.gateway";
    triggerRemoteClawRestartMock.mockReturnValue({ ok: true, method: "launchctl" });
    const result = restartGatewayProcessWithFreshPid();
    expect(result.mode).toBe("supervised");
    expect(triggerRemoteClawRestartMock).toHaveBeenCalledOnce();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("spawns detached child with current exec argv", () => {
    delete process.env.REMOTECLAW_NO_RESPAWN;
    clearSupervisorHints();
    setPlatform("linux");
    process.execArgv = ["--import", "tsx"];
    process.argv = ["/usr/local/bin/node", "/repo/dist/index.js", "gateway", "run"];
    spawnMock.mockReturnValue({ pid: 4242, unref: vi.fn() });

    const result = restartGatewayProcessWithFreshPid();

    expect(result).toEqual({ mode: "spawned", pid: 4242 });
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ["--import", "tsx", "/repo/dist/index.js", "gateway", "run"],
      expect.objectContaining({
        detached: true,
        stdio: "inherit",
      }),
    );
  });

  it("returns supervised when REMOTECLAW_LAUNCHD_LABEL is set (stock launchd plist)", () => {
    clearSupervisorHints();
    expectLaunchdKickstartSupervised();
  });

  it("returns supervised when REMOTECLAW_SYSTEMD_UNIT is set", () => {
    clearSupervisorHints();
    setPlatform("linux");
    process.env.REMOTECLAW_SYSTEMD_UNIT = "remoteclaw-gateway.service";
    const result = restartGatewayProcessWithFreshPid();
    expect(result.mode).toBe("supervised");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns supervised when RemoteClaw gateway task markers are set on Windows", () => {
    clearSupervisorHints();
    setPlatform("win32");
    process.env.REMOTECLAW_SERVICE_MARKER = "remoteclaw";
    process.env.REMOTECLAW_SERVICE_KIND = "gateway";
    triggerRemoteClawRestartMock.mockReturnValue({ ok: true, method: "schtasks" });
    const result = restartGatewayProcessWithFreshPid();
    expect(result.mode).toBe("supervised");
    expect(triggerRemoteClawRestartMock).toHaveBeenCalledOnce();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("keeps generic service markers out of non-Windows supervisor detection", () => {
    clearSupervisorHints();
    setPlatform("linux");
    process.env.REMOTECLAW_SERVICE_MARKER = "remoteclaw";
    process.env.REMOTECLAW_SERVICE_KIND = "gateway";
    spawnMock.mockReturnValue({ pid: 4242, unref: vi.fn() });

    const result = restartGatewayProcessWithFreshPid();

    expect(result).toEqual({ mode: "spawned", pid: 4242 });
    expect(triggerRemoteClawRestartMock).not.toHaveBeenCalled();
  });

  it("returns disabled on Windows without Scheduled Task markers", () => {
    clearSupervisorHints();
    setPlatform("win32");

    const result = restartGatewayProcessWithFreshPid();

    expect(result.mode).toBe("disabled");
    expect(result.detail).toContain("Scheduled Task");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("ignores node task script hints for gateway restart detection on Windows", () => {
    clearSupervisorHints();
    setPlatform("win32");
    process.env.REMOTECLAW_TASK_SCRIPT = "C:\\remoteclaw\\node.cmd";
    process.env.REMOTECLAW_TASK_SCRIPT_NAME = "node.cmd";
    process.env.REMOTECLAW_SERVICE_MARKER = "remoteclaw";
    process.env.REMOTECLAW_SERVICE_KIND = "node";

    const result = restartGatewayProcessWithFreshPid();

    expect(result.mode).toBe("disabled");
    expect(triggerRemoteClawRestartMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns failed when spawn throws", () => {
    delete process.env.REMOTECLAW_NO_RESPAWN;
    clearSupervisorHints();
    setPlatform("linux");

    spawnMock.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const result = restartGatewayProcessWithFreshPid();
    expect(result.mode).toBe("failed");
    expect(result.detail).toContain("spawn failed");
  });
});
