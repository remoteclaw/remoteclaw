import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trashMocks = vi.hoisted(() => ({
  movePathToTrash: vi.fn(async (from: string) => `${from}.trashed`),
}));

const pwAiMocks = vi.hoisted(() => ({
  closePlaywrightBrowserConnection: vi.fn(async () => {}),
}));

vi.mock("./trash.js", () => trashMocks);
vi.mock("./pw-ai.js", () => pwAiMocks);

let createProfileResetOps: typeof import("./server-context.reset.js").createProfileResetOps;

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(async () => {
  vi.resetModules();
  ({ createProfileResetOps } = await import("./server-context.reset.js"));
});

function localRemoteClawProfile(): Parameters<typeof createProfileResetOps>[0]["profile"] {
  return {
    name: "remoteclaw",
    cdpUrl: "http://127.0.0.1:18800",
    cdpHost: "127.0.0.1",
    cdpIsLoopback: true,
    cdpPort: 18800,
    color: "#f60",
    driver: "remoteclaw",
    attachOnly: false,
  };
}

function createLocalRemoteClawResetOps(
  params: Omit<Parameters<typeof createProfileResetOps>[0], "profile">,
) {
  return createProfileResetOps({ profile: localRemoteClawProfile(), ...params });
}

function createStatelessResetOps(profile: Parameters<typeof createProfileResetOps>[0]["profile"]) {
  return createProfileResetOps({
    profile,
    getProfileState: () => ({ profile: {} as never, running: null }),
    stopRunningBrowser: vi.fn(async () => ({ stopped: false })),
    isHttpReachable: vi.fn(async () => false),
    resolveRemoteClawUserDataDir: (name: string) => `/tmp/${name}`,
  });
}

describe("createProfileResetOps", () => {
  it("rejects remote non-extension profiles", async () => {
    const ops = createStatelessResetOps({
      ...localRemoteClawProfile(),
      name: "remote",
      cdpUrl: "https://browserless.example/chrome",
      cdpHost: "browserless.example",
      cdpIsLoopback: false,
      cdpPort: 443,
      color: "#0f0",
    });

    await expect(ops.resetProfile()).rejects.toThrow(/only supported for local profiles/i);
  });

  it("stops local browser, closes playwright connection, and trashes profile dir", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-reset-"));
    const profileDir = path.join(tempRoot, "remoteclaw");
    fs.mkdirSync(profileDir, { recursive: true });

    const stopRunningBrowser = vi.fn(async () => ({ stopped: true }));
    const isHttpReachable = vi.fn(async () => true);
    const getProfileState = vi.fn(() => ({
      profile: {} as never,
      running: { pid: 1 } as never,
    }));

    const ops = createLocalRemoteClawResetOps({
      getProfileState,
      stopRunningBrowser,
      isHttpReachable,
      resolveRemoteClawUserDataDir: () => profileDir,
    });

    const result = await ops.resetProfile();
    expect(result).toEqual({
      moved: true,
      from: profileDir,
      to: `${profileDir}.trashed`,
    });
    expect(isHttpReachable).toHaveBeenCalledWith(300);
    expect(stopRunningBrowser).toHaveBeenCalledTimes(1);
    expect(pwAiMocks.closePlaywrightBrowserConnection).toHaveBeenCalledWith({
      cdpUrl: "http://127.0.0.1:18800",
    });
    expect(trashMocks.movePathToTrash).toHaveBeenCalledWith(profileDir);
  });

  it("forces playwright disconnect when loopback cdp is occupied by non-owned process", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-reset-no-own-"));
    const profileDir = path.join(tempRoot, "remoteclaw");
    fs.mkdirSync(profileDir, { recursive: true });

    const stopRunningBrowser = vi.fn(async () => ({ stopped: false }));
    const ops = createLocalRemoteClawResetOps({
      getProfileState: () => ({ profile: {} as never, running: null }),
      stopRunningBrowser,
      isHttpReachable: vi.fn(async () => true),
      resolveRemoteClawUserDataDir: () => profileDir,
    });

    await ops.resetProfile();
    expect(stopRunningBrowser).not.toHaveBeenCalled();
    expect(pwAiMocks.closePlaywrightBrowserConnection).toHaveBeenCalledTimes(2);
    expect(pwAiMocks.closePlaywrightBrowserConnection).toHaveBeenNthCalledWith(1, {
      cdpUrl: "http://127.0.0.1:18800",
    });
    expect(pwAiMocks.closePlaywrightBrowserConnection).toHaveBeenNthCalledWith(2, {
      cdpUrl: "http://127.0.0.1:18800",
    });
  });
});
