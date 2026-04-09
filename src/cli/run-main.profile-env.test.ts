import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dotenvState = vi.hoisted(() => {
  const state = {
    profileAtDotenvLoad: undefined as string | undefined,
  };
  return {
    state,
    loadDotEnv: vi.fn(() => {
      state.profileAtDotenvLoad = process.env.REMOTECLAW_PROFILE;
    }),
  };
});

vi.mock("../infra/dotenv.js", () => ({
  loadDotEnv: dotenvState.loadDotEnv,
}));

vi.mock("../infra/env.js", () => ({
  normalizeEnv: vi.fn(),
}));

vi.mock("../infra/runtime-guard.js", () => ({
  assertSupportedRuntime: vi.fn(),
}));

vi.mock("../infra/path-env.js", () => ({
  ensureRemoteClawCliOnPath: vi.fn(),
}));

vi.mock("./route.js", () => ({
  tryRouteCli: vi.fn(async () => true),
}));

vi.mock("./windows-argv.js", () => ({
  normalizeWindowsArgv: (argv: string[]) => argv,
}));

import { runCli } from "./run-main.js";

describe("runCli profile env bootstrap", () => {
  const originalProfile = process.env.REMOTECLAW_PROFILE;
  const originalStateDir = process.env.REMOTECLAW_STATE_DIR;
  const originalConfigPath = process.env.REMOTECLAW_CONFIG_PATH;

  beforeEach(() => {
    delete process.env.REMOTECLAW_PROFILE;
    delete process.env.REMOTECLAW_STATE_DIR;
    delete process.env.REMOTECLAW_CONFIG_PATH;
    dotenvState.state.profileAtDotenvLoad = undefined;
    dotenvState.loadDotEnv.mockClear();
  });

  afterEach(() => {
    if (originalProfile === undefined) {
      delete process.env.REMOTECLAW_PROFILE;
    } else {
      process.env.REMOTECLAW_PROFILE = originalProfile;
    }
    if (originalStateDir === undefined) {
      delete process.env.REMOTECLAW_STATE_DIR;
    } else {
      process.env.REMOTECLAW_STATE_DIR = originalStateDir;
    }
    if (originalConfigPath === undefined) {
      delete process.env.REMOTECLAW_CONFIG_PATH;
    } else {
      process.env.REMOTECLAW_CONFIG_PATH = originalConfigPath;
    }
  });

  it("applies --profile before dotenv loading", async () => {
    await runCli(["node", "remoteclaw", "--profile", "rawdog", "status"]);

    expect(dotenvState.loadDotEnv).toHaveBeenCalledOnce();
    expect(dotenvState.state.profileAtDotenvLoad).toBe("rawdog");
    expect(process.env.REMOTECLAW_PROFILE).toBe("rawdog");
  });
});
