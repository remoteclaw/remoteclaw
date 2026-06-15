import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createChannelTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import type { ChannelId, ChannelPlugin } from "./plugins/types.js";
import { inspectReadOnlyChannelAccount } from "./read-only-account-inspect.js";

const emptyRegistry = createTestRegistry([]);

function registerChannelPlugin(plugin: ChannelPlugin): void {
  setActivePluginRegistry(
    createTestRegistry([{ pluginId: String(plugin.id), source: "test", plugin }]),
  );
}

function buildPlugin(params: {
  id: ChannelId;
  config?: Partial<ChannelPlugin["config"]>;
}): ChannelPlugin {
  return createChannelTestPluginBase({ id: params.id, config: params.config }) as ChannelPlugin;
}

describe("inspectReadOnlyChannelAccount", () => {
  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("resolves account information via the channel plugin inspector", async () => {
    const inspectAccount = vi.fn((_cfg: RemoteClawConfig, accountId?: string | null) => ({
      accountId,
      enabled: true,
      configured: true,
    }));
    registerChannelPlugin(buildPlugin({ id: "discord", config: { inspectAccount } }));

    const cfg = { channels: {} } as RemoteClawConfig;
    const result = await inspectReadOnlyChannelAccount({
      channelId: "discord",
      cfg,
      accountId: "default",
    });

    expect(result).toEqual({ accountId: "default", enabled: true, configured: true });
    expect(inspectAccount).toHaveBeenCalledTimes(1);
    expect(inspectAccount).toHaveBeenCalledWith(cfg, "default");
  });

  it("returns null when the channel plugin is not registered", async () => {
    const result = await inspectReadOnlyChannelAccount({
      channelId: "discord",
      cfg: {} as RemoteClawConfig,
      accountId: "default",
    });
    expect(result).toBeNull();
  });

  it("returns null when the registered plugin exposes no inspector", async () => {
    registerChannelPlugin(buildPlugin({ id: "discord" }));
    const result = await inspectReadOnlyChannelAccount({
      channelId: "discord",
      cfg: {} as RemoteClawConfig,
    });
    expect(result).toBeNull();
  });

  it("awaits asynchronous inspectors", async () => {
    const inspectAccount = vi.fn(async () => ({ enabled: false }));
    registerChannelPlugin(buildPlugin({ id: "slack", config: { inspectAccount } }));
    const result = await inspectReadOnlyChannelAccount({
      channelId: "slack",
      cfg: {} as RemoteClawConfig,
    });
    expect(result).toEqual({ enabled: false });
  });

  it("is side-effect-free: never invokes resolvers/mutators and never mutates config", async () => {
    const inspectAccount = vi.fn((_cfg: RemoteClawConfig, accountId?: string | null) => ({
      accountId,
    }));
    const resolveAccount = vi.fn(() => ({}));
    const setAccountEnabled = vi.fn((params: { cfg: RemoteClawConfig }) => params.cfg);
    registerChannelPlugin(
      buildPlugin({
        id: "discord",
        config: { inspectAccount, resolveAccount, setAccountEnabled },
      }),
    );

    const cfg = {
      channels: { discord: { enabled: true, accounts: { default: {} } } },
    } as RemoteClawConfig;
    const before = JSON.stringify(cfg);

    await inspectReadOnlyChannelAccount({ channelId: "discord", cfg, accountId: "default" });

    expect(resolveAccount).not.toHaveBeenCalled();
    expect(setAccountEnabled).not.toHaveBeenCalled();
    expect(JSON.stringify(cfg)).toBe(before);
  });
});
