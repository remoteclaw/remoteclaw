import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";
import type { RestartSentinelPayload } from "../../infra/restart-sentinel.js";
import {
  createConfigHandlerHarness,
  createConfigWriteSnapshot,
  flushConfigHandlerMicrotasks,
} from "./config.test-helpers.js";

const readConfigFileSnapshotForWriteMock = vi.fn();
const writeConfigFileMock = vi.fn();
const persistedConfigResultMock = vi.fn((config: RemoteClawConfig) => config);
const validateConfigObjectWithPluginsMock = vi.fn();
const prepareSecretsRuntimeSnapshotMock = vi.fn();
const scheduleGatewaySigusr1RestartMock = vi.fn(() => ({
  scheduled: true,
  delayMs: 1_000,
  coalesced: false,
}));
const restartSentinelMocks = vi.hoisted(() => ({
  writeRestartSentinel: vi.fn(async (_payload: RestartSentinelPayload) => undefined),
}));

vi.mock("../../config/config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/config.js")>("../../config/config.js");
  return {
    ...actual,
    createConfigIO: () => ({ configPath: "/tmp/remoteclaw.json" }),
    readConfigFileSnapshotForWrite: readConfigFileSnapshotForWriteMock,
    validateConfigObjectWithPlugins: validateConfigObjectWithPluginsMock,
    writeConfigFile: writeConfigFileMock,
    replaceConfigFile: async (params: { nextConfig: RemoteClawConfig; writeOptions?: unknown }) => {
      await writeConfigFileMock(params.nextConfig, params.writeOptions);
      const persistedConfig = persistedConfigResultMock(params.nextConfig);
      return {
        path: "/tmp/remoteclaw.json",
        previousHash: "base-hash",
        snapshot: createConfigWriteSnapshot(params.nextConfig),
        nextConfig: persistedConfig,
        persistedHash: "next-hash",
        afterWrite: { mode: "auto" },
        followUp: { mode: "auto", requiresRestart: false },
      };
    },
  };
});

vi.mock("../../config/runtime-schema.js", () => ({
  loadGatewayRuntimeConfigSchema: () => ({ uiHints: undefined }),
}));

vi.mock("../../secrets/runtime.js", () => ({
  prepareSecretsRuntimeSnapshot: prepareSecretsRuntimeSnapshotMock,
}));

vi.mock("../../secrets/runtime-state.js", () => ({
  getActiveSecretsRuntimeSnapshot: () => null,
}));

vi.mock("../../infra/restart.js", () => ({
  scheduleGatewaySigusr1Restart: scheduleGatewaySigusr1RestartMock,
}));

vi.mock("../../infra/restart-sentinel.js", async () => {
  const actual = await vi.importActual<typeof import("../../infra/restart-sentinel.js")>(
    "../../infra/restart-sentinel.js",
  );
  return {
    ...actual,
    writeRestartSentinel: restartSentinelMocks.writeRestartSentinel,
  };
});

const { configHandlers } = await import("./config.js");

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  validateConfigObjectWithPluginsMock.mockImplementation((config: RemoteClawConfig) => ({
    ok: true,
    config,
  }));
  prepareSecretsRuntimeSnapshotMock.mockImplementation(
    async ({ config }: { config: RemoteClawConfig }) => ({
      config,
    }),
  );
  restartSentinelMocks.writeRestartSentinel.mockClear();
  persistedConfigResultMock.mockImplementation((config: RemoteClawConfig) => config);
});

describe("config shared auth disconnects", () => {
  // Fork divergence: writeConfigFile returns void (the fork omits upstream's
  // commitGatewayConfigWrite write-result plumbing), so config.set echoes the
  // redacted SUBMITTED config — not the persisted write result upstream stamps
  // with meta.lastTouchedVersion.
  it("echoes the submitted config from config.set (fork does not surface the persisted write result)", async () => {
    const prevConfig: RemoteClawConfig = {
      gateway: {
        port: 19000,
      },
    };
    const submittedConfig: RemoteClawConfig = {
      gateway: {
        port: 19001,
      },
    };
    const persistedConfig: RemoteClawConfig = {
      gateway: {
        port: 19001,
      },
      meta: {
        lastTouchedVersion: "test",
      },
    };
    persistedConfigResultMock.mockReturnValueOnce(persistedConfig);
    readConfigFileSnapshotForWriteMock.mockResolvedValue(createConfigWriteSnapshot(prevConfig));

    const { options, respond } = createConfigHandlerHarness({
      method: "config.set",
      params: {
        raw: JSON.stringify(submittedConfig, null, 2),
        baseHash: "base-hash",
      },
    });

    await configHandlers["config.set"](options);
    await flushConfigHandlerMicrotasks();

    expect(writeConfigFileMock).toHaveBeenCalledWith(submittedConfig, {});
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        ok: true,
        path: "/tmp/remoteclaw.json",
        config: submittedConfig,
      },
      undefined,
    );
  });

  it("does not disconnect shared-auth clients for config.set auth writes without restart", async () => {
    const prevConfig: RemoteClawConfig = {
      gateway: {
        auth: {
          mode: "token",
          token: "old-token",
        },
      },
    };
    const nextConfig: RemoteClawConfig = {
      gateway: {
        auth: {
          mode: "token",
          token: "new-token",
        },
      },
    };
    readConfigFileSnapshotForWriteMock.mockResolvedValue(createConfigWriteSnapshot(prevConfig));

    const { options, disconnectClientsUsingSharedGatewayAuth } = createConfigHandlerHarness({
      method: "config.set",
      params: {
        raw: JSON.stringify(nextConfig, null, 2),
        baseHash: "base-hash",
      },
    });

    await configHandlers["config.set"](options);
    await flushConfigHandlerMicrotasks();

    expect(writeConfigFileMock).toHaveBeenCalledWith(nextConfig, {});
    expect(disconnectClientsUsingSharedGatewayAuth).not.toHaveBeenCalled();
    expect(scheduleGatewaySigusr1RestartMock).not.toHaveBeenCalled();
  });

  it("disconnects shared-auth clients after config.patch rotates the active token", async () => {
    const prevConfig: RemoteClawConfig = {
      gateway: {
        auth: {
          mode: "token",
          token: "old-token",
        },
      },
    };
    readConfigFileSnapshotForWriteMock.mockResolvedValue(createConfigWriteSnapshot(prevConfig));

    const { options, disconnectClientsUsingSharedGatewayAuth } = createConfigHandlerHarness({
      method: "config.patch",
      params: {
        baseHash: "base-hash",
        raw: JSON.stringify({ gateway: { auth: { token: "new-token" } } }),
        restartDelayMs: 1_000,
      },
    });

    await configHandlers["config.patch"](options);
    await flushConfigHandlerMicrotasks();

    expect(scheduleGatewaySigusr1RestartMock).toHaveBeenCalledTimes(1);
    expect(disconnectClientsUsingSharedGatewayAuth).toHaveBeenCalledTimes(1);
  });

  it("does not disconnect shared-auth clients when config.patch changes only inactive password auth", async () => {
    const prevConfig: RemoteClawConfig = {
      gateway: {
        auth: {
          mode: "token",
          token: "old-token",
        },
      },
    };
    readConfigFileSnapshotForWriteMock.mockResolvedValue(createConfigWriteSnapshot(prevConfig));

    const { options, disconnectClientsUsingSharedGatewayAuth } = createConfigHandlerHarness({
      method: "config.patch",
      params: {
        baseHash: "base-hash",
        raw: JSON.stringify({ gateway: { auth: { password: "new-password" } } }),
        restartDelayMs: 1_000,
      },
    });

    await configHandlers["config.patch"](options);
    await flushConfigHandlerMicrotasks();

    expect(scheduleGatewaySigusr1RestartMock).toHaveBeenCalledTimes(1);
    expect(disconnectClientsUsingSharedGatewayAuth).not.toHaveBeenCalled();
  });

  it("does not add an agent continuation from generic control-plane sessionKey params", async () => {
    const prevConfig: RemoteClawConfig = {
      gateway: {
        reload: {
          mode: "hot",
        },
      },
    };
    readConfigFileSnapshotForWriteMock.mockResolvedValue(createConfigWriteSnapshot(prevConfig));

    const { options } = createConfigHandlerHarness({
      method: "config.patch",
      params: {
        baseHash: "base-hash",
        raw: JSON.stringify({ gateway: { port: 19001 } }),
        restartDelayMs: 1_000,
        sessionKey: "agent:main:main",
      },
    });

    await configHandlers["config.patch"](options);

    const payload = restartSentinelMocks.writeRestartSentinel.mock.calls.at(-1)?.[0];
    expect(payload?.sessionKey).toBe("agent:main:main");
    expect(payload?.continuation).toBeUndefined();
  });
});
