import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginRuntime } from "../../../src/plugins/runtime/types.js";
import { createRuntimeEnv } from "../../../test/helpers/extensions/runtime-env.js";
import type { ResolvedDiscordAccount } from "./accounts.js";
import type { RemoteClawConfig } from "./runtime-api.js";
let discordPlugin: typeof import("./channel.js").discordPlugin;
let setDiscordRuntime: typeof import("./runtime.js").setDiscordRuntime;

const probeDiscordMock = vi.hoisted(() => vi.fn());
const monitorDiscordProviderMock = vi.hoisted(() => vi.fn());
const auditDiscordChannelPermissionsMock = vi.hoisted(() => vi.fn());

vi.mock("./probe.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./probe.js")>();
  return {
    ...actual,
    probeDiscord: probeDiscordMock,
  };
});

vi.mock("./monitor/provider.runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./monitor/provider.runtime.js")>();
  return {
    ...actual,
    monitorDiscordProvider: monitorDiscordProviderMock,
  };
});

vi.mock("./audit.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./audit.js")>();
  return {
    ...actual,
    auditDiscordChannelPermissions: auditDiscordChannelPermissionsMock,
  };
});

function createCfg(): RemoteClawConfig {
  return {
    channels: {
      discord: {
        enabled: true,
        token: "discord-token",
      },
    },
  } as RemoteClawConfig;
}

function resolveAccount(cfg: RemoteClawConfig): ResolvedDiscordAccount {
  return discordPlugin.config.resolveAccount(cfg, "default") as ResolvedDiscordAccount;
}

function startDiscordAccount(cfg: RemoteClawConfig) {
  return discordPlugin.gateway!.startAccount!(
    createStartAccountContext({
      account: resolveAccount(cfg),
      cfg,
    }),
  );
}

function installDiscordRuntime(discord: Record<string, unknown>) {
  setDiscordRuntime({
    channel: {
      discord,
    },
    logging: {
      shouldLogVerbose: () => false,
    },
  } as unknown as PluginRuntime);
}

afterEach(() => {
  probeDiscordMock.mockReset();
  monitorDiscordProviderMock.mockReset();
  auditDiscordChannelPermissionsMock.mockReset();
});

beforeEach(async () => {
  vi.useRealTimers();
  vi.resetModules();
  ({ discordPlugin } = await import("./channel.js"));
  ({ setDiscordRuntime } = await import("./runtime.js"));
});

describe("discordPlugin outbound", () => {
  it("forwards mediaLocalRoots to sendMessageDiscord", async () => {
    const sendMessageDiscord = vi.fn(async () => ({ messageId: "m1" }));
    setDiscordRuntime({
      channel: {
        discord: {
          sendMessageDiscord,
        },
      },
    } as unknown as PluginRuntime);

    const result = await discordPlugin.outbound!.sendMedia!({
      cfg: {} as RemoteClawConfig,
      to: "channel:123",
      text: "hi",
      mediaUrl: "/tmp/image.png",
      mediaLocalRoots: ["/tmp/agent-root"],
      accountId: "work",
    });

    expect(sendMessageDiscord).toHaveBeenCalledWith(
      "channel:123",
      "hi",
      expect.objectContaining({
        mediaUrl: "/tmp/image.png",
        mediaLocalRoots: ["/tmp/agent-root"],
      }),
    );
    expect(result).toMatchObject({ channel: "discord", messageId: "m1" });
  });
});
