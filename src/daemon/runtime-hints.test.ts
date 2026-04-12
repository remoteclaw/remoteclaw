import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          REMOTECLAW_STATE_DIR: "/tmp/remoteclaw-state",
          REMOTECLAW_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "remoteclaw-gateway",
        windowsTaskName: "RemoteClaw Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/remoteclaw-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/remoteclaw-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "remoteclaw-gateway",
        windowsTaskName: "RemoteClaw Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u remoteclaw-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "remoteclaw-gateway",
        windowsTaskName: "RemoteClaw Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "RemoteClaw Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "remoteclaw gateway install",
        startCommand: "remoteclaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.remoteclaw.gateway.plist",
        systemdServiceName: "remoteclaw-gateway",
        windowsTaskName: "RemoteClaw Gateway",
      }),
    ).toEqual([
      "remoteclaw gateway install",
      "remoteclaw gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.remoteclaw.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "remoteclaw gateway install",
        startCommand: "remoteclaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.remoteclaw.gateway.plist",
        systemdServiceName: "remoteclaw-gateway",
        windowsTaskName: "RemoteClaw Gateway",
      }),
    ).toEqual([
      "remoteclaw gateway install",
      "remoteclaw gateway",
      "systemctl --user start remoteclaw-gateway.service",
    ]);
  });
});
