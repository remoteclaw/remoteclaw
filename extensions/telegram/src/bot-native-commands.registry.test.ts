import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";
const deliveryMocks = vi.hoisted(() => ({
  deliverReplies: vi.fn(async () => ({ delivered: true })),
}));

let registerTelegramNativeCommands: typeof import("./bot-native-commands.js").registerTelegramNativeCommands;
let clearPluginCommands: typeof import("../../../src/plugins/commands.js").clearPluginCommands;
let registerPluginCommand: typeof import("../../../src/plugins/commands.js").registerPluginCommand;
let createCommandBot: typeof import("./bot-native-commands.menu-test-support.js").createCommandBot;
let createNativeCommandTestParams: typeof import("./bot-native-commands.menu-test-support.js").createNativeCommandTestParams;
let createPrivateCommandContext: typeof import("./bot-native-commands.menu-test-support.js").createPrivateCommandContext;
let waitForRegisteredCommands: typeof import("./bot-native-commands.menu-test-support.js").waitForRegisteredCommands;

describe("registerTelegramNativeCommands real plugin registry", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("./bot/delivery.js", () => ({
      deliverReplies: deliveryMocks.deliverReplies,
    }));
    vi.doMock("./bot/delivery.replies.js", () => ({
      deliverReplies: deliveryMocks.deliverReplies,
    }));
    ({ clearPluginCommands, registerPluginCommand } =
      await import("../../../src/plugins/commands.js"));
    ({ registerTelegramNativeCommands } = await import("./bot-native-commands.js"));
    ({
      createCommandBot,
      createNativeCommandTestParams,
      createPrivateCommandContext,
      waitForRegisteredCommands,
    } = await import("./bot-native-commands.menu-test-support.js"));
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
        commands: { allowFrom: { telegram: ["999"] } } as RemoteClawConfig["commands"],
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
