import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { withEnvAsync } from "../test-utils/env.js";

const mocks = vi.hoisted(() => ({
  readCommand: vi.fn(),
  install: vi.fn(),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
  auditGatewayServiceConfig: vi.fn(),
  buildGatewayInstallPlan: vi.fn(),
  resolveGatewayPort: vi.fn(() => 18789),
  resolveIsNixMode: vi.fn(() => false),
  findExtraGatewayServices: vi.fn().mockResolvedValue([]),
  renderGatewayServiceCleanupHints: vi.fn().mockReturnValue([]),
  uninstallLegacySystemdUnits: vi.fn().mockResolvedValue([]),
  note: vi.fn(),
}));

vi.mock("../config/paths.js", () => ({
  resolveGatewayPort: mocks.resolveGatewayPort,
  resolveIsNixMode: mocks.resolveIsNixMode,
}));

vi.mock("../config/config.js", () => ({
  writeConfigFile: mocks.writeConfigFile,
}));

vi.mock("../daemon/inspect.js", () => ({
  findExtraGatewayServices: mocks.findExtraGatewayServices,
  renderGatewayServiceCleanupHints: mocks.renderGatewayServiceCleanupHints,
}));

vi.mock("../daemon/runtime-paths.js", () => ({
  renderSystemNodeWarning: vi.fn().mockReturnValue(undefined),
  resolveSystemNodeInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock("../daemon/service-audit.js", () => ({
  auditGatewayServiceConfig: mocks.auditGatewayServiceConfig,
  needsNodeRuntimeMigration: vi.fn(() => false),
  readEmbeddedGatewayToken: (
    command: {
      environment?: Record<string, string>;
      environmentValueSources?: Record<string, "inline" | "file">;
    } | null,
  ) =>
    command?.environmentValueSources?.REMOTECLAW_GATEWAY_TOKEN === "file"
      ? undefined
      : command?.environment?.REMOTECLAW_GATEWAY_TOKEN?.trim() || undefined,
  SERVICE_AUDIT_CODES: {
    gatewayEntrypointMismatch: "gateway-entrypoint-mismatch",
  },
}));

vi.mock("../daemon/service.js", () => ({
  resolveGatewayService: () => ({
    readCommand: mocks.readCommand,
    install: mocks.install,
  }),
}));

vi.mock("../daemon/systemd.js", () => ({
  uninstallLegacySystemdUnits: mocks.uninstallLegacySystemdUnits,
}));

vi.mock("../terminal/note.js", () => ({
  note: mocks.note,
}));

vi.mock("./daemon-install-helpers.js", () => ({
  buildGatewayInstallPlan: mocks.buildGatewayInstallPlan,
}));

import {
  maybeRepairGatewayServiceConfig,
  maybeScanExtraGatewayServices,
} from "./doctor-gateway-services.js";

function makeDoctorIo() {
  return { log: vi.fn(), error: vi.fn(), exit: vi.fn() };
}

function makeDoctorPrompts() {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    confirmRepair: vi.fn().mockResolvedValue(true),
    confirmAggressive: vi.fn().mockResolvedValue(true),
    confirmSkipInNonInteractive: vi.fn().mockResolvedValue(true),
    select: vi.fn().mockResolvedValue("node"),
    shouldRepair: false,
    shouldForce: false,
  };
}

async function runRepair(cfg: RemoteClawConfig) {
  await maybeRepairGatewayServiceConfig(cfg, "local", makeDoctorIo(), makeDoctorPrompts());
}

const gatewayProgramArguments = [
  "/usr/bin/node",
  "/usr/local/bin/remoteclaw",
  "gateway",
  "--port",
  "18789",
];

function setupGatewayTokenRepairScenario() {
  mocks.readCommand.mockResolvedValue({
    programArguments: gatewayProgramArguments,
    environment: {
      REMOTECLAW_GATEWAY_TOKEN: "stale-token",
    },
  });
  mocks.auditGatewayServiceConfig.mockResolvedValue({
    ok: false,
    issues: [
      {
        code: "gateway-token-mismatch",
        message: "Gateway service REMOTECLAW_GATEWAY_TOKEN does not match gateway.auth.token",
        level: "recommended",
      },
    ],
  });
  mocks.buildGatewayInstallPlan.mockResolvedValue({
    programArguments: gatewayProgramArguments,
    workingDirectory: "/tmp",
    environment: {},
  });
  mocks.install.mockResolvedValue(undefined);
}

describe("maybeRepairGatewayServiceConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats gateway.auth.token as source of truth for service token repairs", async () => {
    setupGatewayTokenRepairScenario();

    const cfg: RemoteClawConfig = {
      gateway: {
        auth: {
          mode: "token",
          token: "config-token",
        },
      },
    };

    await runRepair(cfg);

    expect(mocks.auditGatewayServiceConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedGatewayToken: "config-token",
      }),
    );
    expect(mocks.buildGatewayInstallPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          gateway: expect.objectContaining({
            auth: expect.objectContaining({
              token: "config-token",
            }),
          }),
        }),
      }),
    );
    expect(mocks.writeConfigFile).not.toHaveBeenCalled();
    expect(mocks.install).toHaveBeenCalledTimes(1);
  });

  it("uses REMOTECLAW_GATEWAY_TOKEN when config token is missing", async () => {
    await withEnvAsync({ REMOTECLAW_GATEWAY_TOKEN: "env-token" }, async () => {
      setupGatewayTokenRepairScenario();

      const cfg: RemoteClawConfig = {
        gateway: {},
      };

      await runRepair(cfg);

      expect(mocks.auditGatewayServiceConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedGatewayToken: "env-token",
        }),
      );
      expect(mocks.buildGatewayInstallPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            gateway: expect.objectContaining({
              auth: expect.objectContaining({
                token: "env-token",
              }),
            }),
          }),
        }),
      );
      expect(mocks.writeConfigFile).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway: expect.objectContaining({
            auth: expect.objectContaining({
              token: "env-token",
            }),
          }),
        }),
      );
      expect(mocks.install).toHaveBeenCalledTimes(1);
    });
  });

  it("treats SecretRef-managed gateway token as non-persisted service state", async () => {
    mocks.readCommand.mockResolvedValue({
      programArguments: gatewayProgramArguments,
      environment: {
        REMOTECLAW_GATEWAY_TOKEN: "stale-token",
      },
    });
    mocks.auditGatewayServiceConfig.mockResolvedValue({
      ok: false,
      issues: [],
    });
    mocks.buildGatewayInstallPlan.mockResolvedValue({
      programArguments: gatewayProgramArguments,
      workingDirectory: "/tmp",
      environment: {},
    });
    mocks.install.mockResolvedValue(undefined);

    const cfg: RemoteClawConfig = {
      gateway: {
        auth: {
          mode: "token",
          token: "REMOTECLAW_GATEWAY_TOKEN",
        },
      },
    };

    await runRepair(cfg);

    expect(mocks.auditGatewayServiceConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedGatewayToken: undefined,
      }),
    );
    expect(mocks.buildGatewayInstallPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
      }),
    );
    expect(mocks.install).toHaveBeenCalledTimes(1);
  });

  it("falls back to embedded service token when config and env tokens are missing", async () => {
    await withEnvAsync(
      {
        REMOTECLAW_GATEWAY_TOKEN: undefined,
        CLAWDBOT_GATEWAY_TOKEN: undefined,
      },
      async () => {
        setupGatewayTokenRepairScenario();

        const cfg: RemoteClawConfig = {
          gateway: {},
        };

        await runRepair(cfg);

        expect(mocks.auditGatewayServiceConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            expectedGatewayToken: undefined,
          }),
        );
        expect(mocks.writeConfigFile).toHaveBeenCalledWith(
          expect.objectContaining({
            gateway: expect.objectContaining({
              auth: expect.objectContaining({
                token: "stale-token",
              }),
            }),
          }),
        );
        expect(mocks.buildGatewayInstallPlan).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              gateway: expect.objectContaining({
                auth: expect.objectContaining({
                  token: "stale-token",
                }),
              }),
            }),
          }),
        );
        expect(mocks.install).toHaveBeenCalledTimes(1);
      },
    );
  });

  it("does not persist EnvironmentFile-backed service tokens into config", async () => {
    await withEnvAsync(
      {
        REMOTECLAW_GATEWAY_TOKEN: undefined,
        CLAWDBOT_GATEWAY_TOKEN: undefined,
      },
      async () => {
        mocks.readCommand.mockResolvedValue({
          programArguments: gatewayProgramArguments,
          environment: {
            REMOTECLAW_GATEWAY_TOKEN: "env-file-token",
          },
          environmentValueSources: {
            REMOTECLAW_GATEWAY_TOKEN: "file",
          },
        });
        mocks.auditGatewayServiceConfig.mockResolvedValue({
          ok: false,
          issues: [],
        });
        mocks.buildGatewayInstallPlan.mockResolvedValue({
          programArguments: gatewayProgramArguments,
          workingDirectory: "/tmp",
          environment: {},
        });
        mocks.install.mockResolvedValue(undefined);

        const cfg: OpenClawConfig = {
          gateway: {},
        };

        await runRepair(cfg);

        expect(mocks.writeConfigFile).not.toHaveBeenCalled();
        expect(mocks.buildGatewayInstallPlan).toHaveBeenCalledWith(
          expect.objectContaining({
            config: cfg,
          }),
        );
      },
    );
  });
});

describe("maybeScanExtraGatewayServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findExtraGatewayServices.mockResolvedValue([]);
    mocks.renderGatewayServiceCleanupHints.mockReturnValue([]);
    mocks.uninstallLegacySystemdUnits.mockResolvedValue([]);
  });

  it("removes legacy Linux user systemd services", async () => {
    mocks.findExtraGatewayServices.mockResolvedValue([
      {
        platform: "linux",
        label: "moltbot-gateway.service",
        detail: "unit: /home/test/.config/systemd/user/moltbot-gateway.service",
        scope: "user",
        legacy: true,
      },
    ]);
    mocks.uninstallLegacySystemdUnits.mockResolvedValue([
      {
        name: "moltbot-gateway",
        unitPath: "/home/test/.config/systemd/user/moltbot-gateway.service",
        enabled: true,
        exists: true,
      },
    ]);

    const runtime = { log: vi.fn(), error: vi.fn(), exit: vi.fn() };
    const prompter = {
      confirm: vi.fn(),
      confirmRepair: vi.fn(),
      confirmAggressive: vi.fn(),
      confirmSkipInNonInteractive: vi.fn().mockResolvedValue(true),
      select: vi.fn(),
      shouldRepair: false,
      shouldForce: false,
    };

    await maybeScanExtraGatewayServices({ deep: false }, runtime, prompter);

    expect(mocks.uninstallLegacySystemdUnits).toHaveBeenCalledTimes(1);
    expect(mocks.uninstallLegacySystemdUnits).toHaveBeenCalledWith({
      env: process.env,
      stdout: process.stdout,
    });
    expect(mocks.note).toHaveBeenCalledWith(
      expect.stringContaining("moltbot-gateway.service"),
      "Legacy gateway removed",
    );
    expect(runtime.log).toHaveBeenCalledWith(
      "Legacy gateway services removed. Installing RemoteClaw gateway next.",
    );
  });
});
