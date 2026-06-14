import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDefaultChannelPluginRegistryForTests } from "./channel-test-helpers.js";
import { configMocks, offsetMocks } from "./channels.mock-harness.js";
import { baseConfigSnapshot, createTestRuntime } from "./test-runtime-config-helpers.js";

const runtime = createTestRuntime();
let channelsAddCommand: typeof import("./channels.js").channelsAddCommand;

describe("channelsAddCommand", () => {
  beforeAll(async () => {
    ({ channelsAddCommand } = await import("./channels/add.js"));
  });

  beforeEach(async () => {
    configMocks.readConfigFileSnapshot.mockClear();
    configMocks.writeConfigFile.mockClear();
    offsetMocks.deleteTelegramUpdateOffset.mockClear();
    runtime.log.mockClear();
    runtime.error.mockClear();
    runtime.exit.mockClear();
    setDefaultChannelPluginRegistryForTests();
  });

  it("runs channel lifecycle hooks only when account config changes", async () => {
    configMocks.readConfigFileSnapshot.mockResolvedValue({
      ...baseConfigSnapshot,
      config: {
        channels: {
          "lifecycle-chat": { token: "old-token", enabled: true },
        },
      },
    });

    await channelsAddCommand(
      { channel: "lifecycle-chat", account: "default", token: "new-token" },
      runtime,
      {
        hasFlags: true,
      },
    );

    expect(lifecycleMocks.onAccountConfigChanged).toHaveBeenCalledTimes(1);
    expect(lifecycleMocks.onAccountConfigChanged).toHaveBeenCalledWith({ accountId: "default" });

    lifecycleMocks.onAccountConfigChanged.mockClear();
    configMocks.readConfigFileSnapshot.mockResolvedValue({
      ...baseConfigSnapshot,
      config: {
        channels: {
          "lifecycle-chat": { token: "same-token", enabled: true },
        },
      },
    });

    await channelsAddCommand(
      { channel: "lifecycle-chat", account: "default", token: "same-token" },
      runtime,
      {
        hasFlags: true,
      },
    );

    expect(offsetMocks.deleteTelegramUpdateOffset).not.toHaveBeenCalled();
  });
});
