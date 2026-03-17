import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type { TelegramAccountConfig } from "../../../src/config/types.js";
import { clearPluginCommands, registerPluginCommand } from "../../../src/plugins/commands.js";
const deliveryMocks = vi.hoisted(() => ({
  deliverReplies: vi.fn(async () => ({ delivered: true })),
}));

vi.mock("./bot/delivery.js", () => ({
  deliverReplies: deliveryMocks.deliverReplies,
}));

import { registerTelegramNativeCommands } from "./bot-native-commands.js";
import {
  createCommandBot,
  createNativeCommandTestParams,
  createPrivateCommandContext,
  waitForRegisteredCommands,
} from "./bot-native-commands.menu-test-support.js";

describe("registerTelegramNativeCommands real plugin registry", () => {
  type RegisteredCommand = {
    command: string;
    description: string;
  };

  async function waitForRegisteredCommands(
    setMyCommands: ReturnType<typeof vi.fn>,
  ): Promise<RegisteredCommand[]> {
    await vi.waitFor(() => {
      expect(setMyCommands).toHaveBeenCalled();
    });
    return setMyCommands.mock.calls[0]?.[0] as RegisteredCommand[];
  }

  const buildParams = (cfg: RemoteClawConfig, accountId = "default") =>
    ({
      bot: {
        api: {
          setMyCommands: vi.fn().mockResolvedValue(undefined),
          sendMessage: vi.fn().mockResolvedValue(undefined),
        },
        command: vi.fn(),
      } as unknown as Parameters<typeof registerTelegramNativeCommands>[0]["bot"],
      cfg,
      runtime: {} as RuntimeEnv,
      accountId,
      telegramCfg: {} as TelegramAccountConfig,
      allowFrom: [],
      groupAllowFrom: [],
      replyToMode: "off",
      textLimit: 4000,
      useAccessGroups: false,
      nativeEnabled: true,
      nativeSkillsEnabled: true,
      nativeDisabledExplicit: false,
      resolveGroupPolicy: () =>
        ({
          allowlistEnabled: false,
          allowed: true,
        }) as ReturnType<
          Parameters<typeof registerTelegramNativeCommands>[0]["resolveGroupPolicy"]
        >,
      resolveTelegramGroupConfig: () => ({
        groupConfig: undefined,
        topicConfig: undefined,
      }),
      shouldSkipUpdate: () => false,
      opts: { token: "token" },
    }) satisfies Parameters<typeof registerTelegramNativeCommands>[0];

  beforeEach(() => {
    clearPluginCommands();
    deliveryMocks.deliverReplies.mockClear();
    deliveryMocks.deliverReplies.mockResolvedValue({ delivered: true });
  });

  afterEach(() => {
    clearPluginCommands();
  });

  it("registers and executes plugin commands through the real plugin registry", async () => {
    const commandHandlers = new Map<string, (ctx: unknown) => Promise<void>>();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const setMyCommands = vi.fn().mockResolvedValue(undefined);

    expect(
      registerPluginCommand("demo-plugin", {
        name: "pair",
        description: "Pair device",
        acceptsArgs: true,
        requireAuth: false,
        handler: async ({ args }) => ({ text: `paired:${args ?? ""}` }),
      }),
    ).toEqual({ ok: true });

    registerTelegramNativeCommands({
      ...buildParams({}),
      bot: {
        api: {
          setMyCommands,
          sendMessage,
        },
        command: vi.fn((name: string, cb: (ctx: unknown) => Promise<void>) => {
          commandHandlers.set(name, cb);
        }),
      } as unknown as Parameters<typeof registerTelegramNativeCommands>[0]["bot"],
    });

    const registeredCommands = await waitForRegisteredCommands(setMyCommands);
    expect(registeredCommands).toEqual(
      expect.arrayContaining([{ command: "pair", description: "Pair device" }]),
    );

    const handler = commandHandlers.get("pair");
    expect(handler).toBeTruthy();

    await handler?.({
      match: "now",
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123, type: "private" },
        from: { id: 456, username: "alice" },
      },
    });

    expect(deliveryMocks.deliverReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        replies: [expect.objectContaining({ text: "paired:now" })],
      }),
    );
    expect(sendMessage).not.toHaveBeenCalledWith(123, "Command not found.");
  });

  it("round-trips Telegram native aliases through the real plugin registry", async () => {
    const { bot, commandHandlers, sendMessage, setMyCommands } = createCommandBot();

    expect(
      registerPluginCommand("demo-plugin", {
        name: "pair",
        nativeNames: {
          telegram: "pair_device",
          discord: "pairdiscord",
        },
        description: "Pair device",
        acceptsArgs: true,
        requireAuth: false,
        handler: async ({ args }) => ({ text: `paired:${args ?? ""}` }),
      }),
    ).toEqual({ ok: true });

    registerTelegramNativeCommands({
      ...createNativeCommandTestParams({}),
      bot,
    });

    const registeredCommands = await waitForRegisteredCommands(setMyCommands);
    expect(registeredCommands).toEqual(
      expect.arrayContaining([{ command: "pair_device", description: "Pair device" }]),
    );

    const handler = commandHandlers.get("pair_device");
    expect(handler).toBeTruthy();

    await handler?.(createPrivateCommandContext({ match: "now", messageId: 2 }));

    expect(deliveryMocks.deliverReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        replies: [expect.objectContaining({ text: "paired:now" })],
      }),
    );
    expect(sendMessage).not.toHaveBeenCalledWith(123, "Command not found.");
  });

  it("keeps real plugin command handlers available when native menu registration is disabled", () => {
    const { bot, commandHandlers, setMyCommands } = createCommandBot();

    expect(
      registerPluginCommand("demo-plugin", {
        name: "pair",
        description: "Pair device",
        acceptsArgs: true,
        requireAuth: false,
        handler: async ({ args }) => ({ text: `paired:${args ?? ""}` }),
      }),
    ).toEqual({ ok: true });

    registerTelegramNativeCommands({
      ...createNativeCommandTestParams({}, { accountId: "default" }),
      bot,
      nativeEnabled: false,
    });

    expect(setMyCommands).not.toHaveBeenCalled();
    expect(commandHandlers.has("pair")).toBe(true);
  });

  it("allows requireAuth:false plugin commands for unauthorized senders through the real registry", async () => {
    const { bot, commandHandlers, sendMessage, setMyCommands } = createCommandBot();

    expect(
      registerPluginCommand("demo-plugin", {
        name: "pair",
        description: "Pair device",
        acceptsArgs: true,
        requireAuth: false,
        handler: async ({ args }) => ({ text: `paired:${args ?? ""}` }),
      }),
    ).toEqual({ ok: true });

    registerTelegramNativeCommands({
      ...createNativeCommandTestParams({
        commands: { allowFrom: { telegram: ["999"] } } as OpenClawConfig["commands"],
      }),
      bot,
      allowFrom: ["999"],
      nativeEnabled: false,
    });

    expect(setMyCommands).not.toHaveBeenCalled();

    const handler = commandHandlers.get("pair");
    expect(handler).toBeTruthy();

    await handler?.(
      createPrivateCommandContext({
        match: "now",
        messageId: 10,
        date: 123456,
        userId: 111,
        username: "nope",
      }),
    );

    expect(deliveryMocks.deliverReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        replies: [expect.objectContaining({ text: "paired:now" })],
      }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
