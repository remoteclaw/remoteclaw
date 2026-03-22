import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePreferredNodePath: vi.fn(),
  resolveGatewayProgramArguments: vi.fn(),
  resolveSystemNodeInfo: vi.fn(),
  renderSystemNodeWarning: vi.fn(),
  buildServiceEnvironment: vi.fn(),
}));

vi.mock("../daemon/runtime-paths.js", () => ({
  resolvePreferredNodePath: mocks.resolvePreferredNodePath,
  resolveSystemNodeInfo: mocks.resolveSystemNodeInfo,
  renderSystemNodeWarning: mocks.renderSystemNodeWarning,
}));

vi.mock("../daemon/program-args.js", () => ({
  resolveGatewayProgramArguments: mocks.resolveGatewayProgramArguments,
}));

vi.mock("../daemon/service-env.js", () => ({
  buildServiceEnvironment: mocks.buildServiceEnvironment,
}));

import {
  buildGatewayInstallPlan,
  gatewayInstallErrorHint,
  readStateDirDotEnvVars,
  resolveGatewayDevMode,
} from "./daemon-install-helpers.js";

afterEach(() => {
  vi.resetAllMocks();
});

describe("resolveGatewayDevMode", () => {
  it("detects dev mode for src ts entrypoints", () => {
    expect(resolveGatewayDevMode(["node", "/Users/me/remoteclaw/src/cli/index.ts"])).toBe(true);
    expect(resolveGatewayDevMode(["node", "C:\\Users\\me\\remoteclaw\\src\\cli\\index.ts"])).toBe(
      true,
    );
    expect(resolveGatewayDevMode(["node", "/Users/me/remoteclaw/dist/cli/index.js"])).toBe(false);
  });
});

function mockNodeGatewayPlanFixture(
  params: {
    workingDirectory?: string;
    version?: string;
    supported?: boolean;
    warning?: string;
    serviceEnvironment?: Record<string, string>;
  } = {},
) {
  const {
    workingDirectory = "/Users/me",
    version = "22.0.0",
    supported = true,
    warning,
    serviceEnvironment = { REMOTECLAW_PORT: "3000" },
  } = params;
  mocks.resolvePreferredNodePath.mockResolvedValue("/opt/node");
  mocks.resolveGatewayProgramArguments.mockResolvedValue({
    programArguments: ["node", "gateway"],
    workingDirectory,
  });
  mocks.resolveSystemNodeInfo.mockResolvedValue({
    path: "/opt/node",
    version,
    supported,
  });
  mocks.renderSystemNodeWarning.mockReturnValue(warning);
  mocks.buildServiceEnvironment.mockReturnValue(serviceEnvironment);
}

describe("buildGatewayInstallPlan", () => {
  it("uses provided nodePath and returns plan", async () => {
    mockNodeGatewayPlanFixture();

    const plan = await buildGatewayInstallPlan({
      env: {},
      port: 3000,
      runtime: "node",
      nodePath: "/custom/node",
    });

    expect(plan.programArguments).toEqual(["node", "gateway"]);
    expect(plan.workingDirectory).toBe("/Users/me");
    expect(plan.environment).toEqual({ REMOTECLAW_PORT: "3000" });
    expect(mocks.resolvePreferredNodePath).not.toHaveBeenCalled();
  });

  it("emits warnings when renderSystemNodeWarning returns one", async () => {
    const warn = vi.fn();
    mockNodeGatewayPlanFixture({
      workingDirectory: undefined,
      version: "18.0.0",
      supported: false,
      warning: "Node too old",
      serviceEnvironment: {},
    });

    await buildGatewayInstallPlan({
      env: {},
      port: 3000,
      runtime: "node",
      warn,
    });

    expect(warn).toHaveBeenCalledWith("Node too old", "Gateway runtime");
    expect(mocks.resolvePreferredNodePath).toHaveBeenCalled();
  });

  it("merges config env vars into the environment", async () => {
    mockNodeGatewayPlanFixture({
      serviceEnvironment: {
        REMOTECLAW_PORT: "3000",
        HOME: "/Users/me",
      },
    });

    const plan = await buildGatewayInstallPlan({
      env: {},
      port: 3000,
      runtime: "node",
      config: {
        env: {
          vars: {
            GOOGLE_API_KEY: "test-key", // pragma: allowlist secret
          },
          CUSTOM_VAR: "custom-value",
        },
      },
    });

    // Config env vars should be present
    expect(plan.environment.GOOGLE_API_KEY).toBe("test-key");
    expect(plan.environment.CUSTOM_VAR).toBe("custom-value");
    // Service environment vars should take precedence
    expect(plan.environment.REMOTECLAW_PORT).toBe("3000");
    expect(plan.environment.HOME).toBe("/Users/me");
  });

  it("drops dangerous config env vars before service merge", async () => {
    mockNodeGatewayPlanFixture({
      serviceEnvironment: {
        REMOTECLAW_PORT: "3000",
      },
    });

    const plan = await buildGatewayInstallPlan({
      env: {},
      port: 3000,
      runtime: "node",
      config: {
        env: {
          vars: {
            NODE_OPTIONS: "--require /tmp/evil.js",
            SAFE_KEY: "safe-value",
          },
        },
      },
    });

    expect(plan.environment.NODE_OPTIONS).toBeUndefined();
    expect(plan.environment.SAFE_KEY).toBe("safe-value");
  });

  it("does not include empty config env values", async () => {
    mockNodeGatewayPlanFixture();

    const plan = await buildGatewayInstallPlan({
      env: {},
      port: 3000,
      runtime: "node",
      config: {
        env: {
          vars: {
            VALID_KEY: "valid",
            EMPTY_KEY: "",
          },
        },
      },
    });

    expect(plan.environment.VALID_KEY).toBe("valid");
    expect(plan.environment.EMPTY_KEY).toBeUndefined();
  });

  it("drops whitespace-only config env values", async () => {
    mockNodeGatewayPlanFixture({ serviceEnvironment: {} });

    const plan = await buildGatewayInstallPlan({
      env: {},
      port: 3000,
      runtime: "node",
      config: {
        env: {
          vars: {
            VALID_KEY: "valid",
          },
          TRIMMED_KEY: "  ",
        },
      },
    });

    expect(plan.environment.VALID_KEY).toBe("valid");
    expect(plan.environment.TRIMMED_KEY).toBeUndefined();
  });

  it("keeps service env values over config env vars", async () => {
    mockNodeGatewayPlanFixture({
      serviceEnvironment: {
        HOME: "/Users/service",
        REMOTECLAW_PORT: "3000",
      },
    });

    const plan = await buildGatewayInstallPlan({
      env: {},
      port: 3000,
      runtime: "node",
      config: {
        env: {
          HOME: "/Users/config",
          vars: {
            REMOTECLAW_PORT: "9999",
          },
        },
      },
    });

    expect(plan.environment.HOME).toBe("/Users/service");
    expect(plan.environment.REMOTECLAW_PORT).toBe("3000");
  });
});

describe("readStateDirDotEnvVars", () => {
  let tmpDir: string;

  function writeDotEnv(content: string): void {
    const ocDir = path.join(tmpDir, ".openclaw");
    fs.mkdirSync(ocDir, { recursive: true });
    fs.writeFileSync(path.join(ocDir, ".env"), content, "utf8");
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-dotenv-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads key-value pairs from state dir .env file", () => {
    writeDotEnv("BRAVE_API_KEY=BSA-test-key\nDISCORD_BOT_TOKEN=discord-tok\n");
    const vars = readStateDirDotEnvVars({ HOME: tmpDir });
    expect(vars.BRAVE_API_KEY).toBe("BSA-test-key");
    expect(vars.DISCORD_BOT_TOKEN).toBe("discord-tok");
  });

  it("returns empty record when .env file is missing", () => {
    const vars = readStateDirDotEnvVars({ HOME: tmpDir });
    expect(vars).toEqual({});
  });

  it("drops dangerous env vars like NODE_OPTIONS", () => {
    writeDotEnv("NODE_OPTIONS=--require /tmp/evil.js\nSAFE_KEY=safe\n");
    const vars = readStateDirDotEnvVars({ HOME: tmpDir });
    expect(vars.NODE_OPTIONS).toBeUndefined();
    expect(vars.SAFE_KEY).toBe("safe");
  });

  it("drops empty and whitespace-only values", () => {
    writeDotEnv("EMPTY=\nBLANK=   \nVALID=ok\n");
    const vars = readStateDirDotEnvVars({ HOME: tmpDir });
    expect(vars.EMPTY).toBeUndefined();
    expect(vars.BLANK).toBeUndefined();
    expect(vars.VALID).toBe("ok");
  });

  it("respects OPENCLAW_STATE_DIR override", () => {
    const customDir = path.join(tmpDir, "custom-state");
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, ".env"), "CUSTOM_KEY=from-override\n", "utf8");
    const vars = readStateDirDotEnvVars({ OPENCLAW_STATE_DIR: customDir });
    expect(vars.CUSTOM_KEY).toBe("from-override");
  });
});

describe("buildGatewayInstallPlan — dotenv merge", () => {
  let tmpDir: string;

  function writeDotEnv(content: string): void {
    const ocDir = path.join(tmpDir, ".openclaw");
    fs.mkdirSync(ocDir, { recursive: true });
    fs.writeFileSync(path.join(ocDir, ".env"), content, "utf8");
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-plan-dotenv-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("merges .env file vars into the install plan", async () => {
    writeDotEnv("BRAVE_API_KEY=BSA-from-env\nOPENROUTER_API_KEY=or-key\n");
    mockNodeGatewayPlanFixture({ serviceEnvironment: { OPENCLAW_PORT: "3000" } });

    const plan = await buildGatewayInstallPlan({
      env: { HOME: tmpDir },
      port: 3000,
      runtime: "node",
    });

    expect(plan.environment.BRAVE_API_KEY).toBe("BSA-from-env");
    expect(plan.environment.OPENROUTER_API_KEY).toBe("or-key");
    expect(plan.environment.OPENCLAW_PORT).toBe("3000");
  });

  it("config env vars override .env file vars", async () => {
    writeDotEnv("MY_KEY=from-dotenv\n");
    mockNodeGatewayPlanFixture({ serviceEnvironment: {} });

    const plan = await buildGatewayInstallPlan({
      env: { HOME: tmpDir },
      port: 3000,
      runtime: "node",
      config: {
        env: {
          vars: {
            MY_KEY: "from-config",
          },
        },
      },
    });

    expect(plan.environment.MY_KEY).toBe("from-config");
  });

  it("service env overrides .env file vars", async () => {
    writeDotEnv("HOME=/from-dotenv\n");
    mockNodeGatewayPlanFixture({
      serviceEnvironment: { HOME: "/from-service" },
    });

    const plan = await buildGatewayInstallPlan({
      env: { HOME: tmpDir },
      port: 3000,
      runtime: "node",
    });

    expect(plan.environment.HOME).toBe("/from-service");
  });

  it("works when .env file does not exist", async () => {
    mockNodeGatewayPlanFixture({ serviceEnvironment: { OPENCLAW_PORT: "3000" } });

    const plan = await buildGatewayInstallPlan({
      env: { HOME: tmpDir },
      port: 3000,
      runtime: "node",
    });

    expect(plan.environment.OPENCLAW_PORT).toBe("3000");
  });
});

describe("gatewayInstallErrorHint", () => {
  it("returns platform-specific hints", () => {
    expect(gatewayInstallErrorHint("win32")).toContain("Run as administrator");
    expect(gatewayInstallErrorHint("linux")).toMatch(
      /remoteclaw( --profile isolated)? gateway install/,
    );
  });
});
