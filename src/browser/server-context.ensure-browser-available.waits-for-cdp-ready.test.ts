import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";
import * as chromeModule from "./chrome.js";
import type { BrowserServerState } from "./server-context.js";
import { createBrowserRouteContext } from "./server-context.js";

const chromeUserDataDir = { dir: "/tmp/remoteclaw" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchRemoteClawChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveRemoteClawUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopRemoteClawChrome: vi.fn(async () => {}),
}));

import type { RunningChrome } from "./chrome.js";

function makeBrowserState(): BrowserServerState {
  return {
    // oxlint-disable-next-line typescript/no-explicit-any
    server: null as any,
    port: 0,
    resolved: {
      enabled: true,
      controlPort: 18791,
      cdpPortRangeStart: 18800,
      cdpPortRangeEnd: 18899,
      cdpProtocol: "http",
      cdpHost: "127.0.0.1",
      cdpIsLoopback: true,
      evaluateEnabled: false,
      remoteCdpTimeoutMs: 1500,
      remoteCdpHandshakeTimeoutMs: 3000,
      extraArgs: [],
      color: "#FF4500",
      headless: true,
      noSandbox: false,
      attachOnly: false,
      ssrfPolicy: { allowPrivateNetwork: true },
      defaultProfile: "remoteclaw",
      profiles: {
        remoteclaw: { cdpPort: 18800, color: "#FF4500" },
      },
    },
    profiles: new Map(),
  };
}

function mockLaunchedChrome(
  launchRemoteClawChrome: { mockResolvedValue: (value: RunningChrome) => unknown },
  pid: number,
) {
  const proc = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  launchRemoteClawChrome.mockResolvedValue({
    pid,
    exe: { kind: "chromium", path: "/usr/bin/chromium" },
    userDataDir: "/tmp/remoteclaw-test",
    cdpPort: 18800,
    startedAt: Date.now(),
    proc,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("browser server-context ensureBrowserAvailable", () => {
  it("waits for CDP readiness after launching to avoid follow-up PortInUseError races (#21149)", async () => {
    vi.useFakeTimers();

    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
    const isChromeCdpReady = vi.mocked(chromeModule.isChromeCdpReady);
    const launchRemoteClawChrome = vi.mocked(chromeModule.launchRemoteClawChrome);

    isChromeReachable.mockResolvedValue(false);
    isChromeCdpReady.mockResolvedValueOnce(false).mockResolvedValue(true);
    mockLaunchedChrome(launchRemoteClawChrome, 123);

    const state = makeBrowserState();
    const ctx = createBrowserRouteContext({ getState: () => state });
    const profile = ctx.forProfile("remoteclaw");

    const promise = profile.ensureBrowserAvailable();
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeUndefined();

    expect(launchRemoteClawChrome).toHaveBeenCalledTimes(1);
    expect(isChromeCdpReady).toHaveBeenCalled();
    expect(chromeModule.stopRemoteClawChrome).not.toHaveBeenCalled();
  });

  it("stops launched chrome when CDP readiness never arrives", async () => {
    vi.useFakeTimers();

    const launchRemoteClawChrome = vi.mocked(chromeModule.launchRemoteClawChrome);
    const stopRemoteClawChrome = vi.mocked(chromeModule.stopRemoteClawChrome);
    const isChromeReachable = vi.mocked(chromeModule.isChromeReachable);
    const isChromeCdpReady = vi.mocked(chromeModule.isChromeCdpReady);

    isChromeReachable.mockResolvedValue(false);
    isChromeCdpReady.mockResolvedValue(false);
    mockLaunchedChrome(launchRemoteClawChrome, 321);

    const state = makeBrowserState();
    const ctx = createBrowserRouteContext({ getState: () => state });
    const profile = ctx.forProfile("remoteclaw");

    const promise = profile.ensureBrowserAvailable();
    const rejected = expect(promise).rejects.toThrow("not reachable after start");
    await vi.advanceTimersByTimeAsync(8100);
    await rejected;

    expect(launchRemoteClawChrome).toHaveBeenCalledTimes(1);
    expect(stopRemoteClawChrome).toHaveBeenCalledTimes(1);
  });
});
