import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type { TelegramAccountConfig } from "../../../src/config/types.js";

let createNativeCommandsHarness: typeof import("./bot-native-commands.test-helpers.js").createNativeCommandsHarness;
let deliverReplies: typeof import("./bot-native-commands.test-helpers.js").deliverReplies;
let executePluginCommand: typeof import("./bot-native-commands.test-helpers.js").executePluginCommand;
let getPluginCommandSpecs: typeof import("./bot-native-commands.test-helpers.js").getPluginCommandSpecs;
let matchPluginCommand: typeof import("./bot-native-commands.test-helpers.js").matchPluginCommand;

let getPluginCommandSpecsMock: {
  mockReturnValue: (
    value: ReturnType<typeof import("../../../src/plugins/commands.js").getPluginCommandSpecs>,
  ) => unknown;
};
let matchPluginCommandMock: {
  mockReturnValue: (
    value: ReturnType<typeof import("../../../src/plugins/commands.js").matchPluginCommand>,
  ) => unknown;
};
let executePluginCommandMock: {
  mockResolvedValue: (
    value: Awaited<
      ReturnType<typeof import("../../../src/plugins/commands.js").executePluginCommand>
    >,
  ) => unknown;
};

describe("registerTelegramNativeCommands (plugin auth)", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({
      createNativeCommandsHarness,
      deliverReplies,
      executePluginCommand,
      getPluginCommandSpecs,
      matchPluginCommand,
    } = await import("./bot-native-commands.test-helpers.js"));
    getPluginCommandSpecsMock =
      getPluginCommandSpecs as unknown as typeof getPluginCommandSpecsMock;
    matchPluginCommandMock = matchPluginCommand as unknown as typeof matchPluginCommandMock;
    executePluginCommandMock = executePluginCommand as unknown as typeof executePluginCommandMock;
    vi.clearAllMocks();
  });

  it("does not register plugin commands in menu when native=false but keeps handlers available", () => {
    const specs = Array.from({ length: 101 }, (_, i) => ({
      name: `cmd_${i}`,
      description: `Command ${i}`,
    }));
    getPluginCommandSpecs.mockReturnValue(specs);

    const handlers: Record<string, (ctx: unknown) => Promise<void>> = {};
    const setMyCommands = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    const bot = {
      api: {
        setMyCommands,
        sendMessage: vi.fn(),
      },
      command: (name: string, handler: (ctx: unknown) => Promise<void>) => {
        handlers[name] = handler;
      },
    } as const;

    registerTelegramNativeCommands({
      bot: bot as unknown as Parameters<typeof registerTelegramNativeCommands>[0]["bot"],
      cfg: {
        agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
      } as RemoteClawConfig,
      runtime: { log } as unknown as RuntimeEnv,
      accountId: "default",
      telegramCfg: {} as TelegramAccountConfig,
      allowFrom: [],
      groupAllowFrom: [],
      replyToMode: "off",
      textLimit: 4000,
      useAccessGroups: false,
      nativeEnabled: false,
      nativeSkillsEnabled: false,
      nativeDisabledExplicit: false,
      resolveGroupPolicy: () =>
        ({
          allowlistEnabled: false,
          allowed: true,
        }) as ChannelGroupPolicy,
      resolveTelegramGroupConfig: () => ({
        groupConfig: undefined,
        topicConfig: undefined,
      }),
      shouldSkipUpdate: () => false,
      opts: { token: "token" },
    });

    expect(setMyCommands).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("registering first 100"));
    expect(Object.keys(handlers)).toHaveLength(101);
  });

  it("allows requireAuth:false plugin command even when sender is unauthorized", async () => {
    const command = {
      name: "plugin",
      description: "Plugin command",
      requireAuth: false,
      handler: vi.fn(),
    } as const;

    getPluginCommandSpecs.mockReturnValue([{ name: "plugin", description: "Plugin command" }]);
    matchPluginCommand.mockReturnValue({ command, args: undefined });
    executePluginCommand.mockResolvedValue({ text: "ok" });

    const handlers: Record<string, (ctx: unknown) => Promise<void>> = {};
    const bot = {
      api: {
        setMyCommands: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn(),
      },
      command: (name: string, handler: (ctx: unknown) => Promise<void>) => {
        handlers[name] = handler;
      },
    } as const;

    const cfg = {
      agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
    } as RemoteClawConfig;
    const telegramCfg = {} as TelegramAccountConfig;
    const resolveGroupPolicy = () =>
      ({
        allowlistEnabled: false,
        allowed: true,
      }) as ChannelGroupPolicy;

    registerTelegramNativeCommands({
      bot: bot as unknown as Parameters<typeof registerTelegramNativeCommands>[0]["bot"],
      cfg,
      runtime: {} as unknown as RuntimeEnv,
      accountId: "default",
      telegramCfg,
      allowFrom: ["999"],
      groupAllowFrom: [],
      replyToMode: "off",
      textLimit: 4000,
      useAccessGroups: false,
      nativeEnabled: false,
      nativeSkillsEnabled: false,
      nativeDisabledExplicit: false,
      resolveGroupPolicy,
      resolveTelegramGroupConfig: () => ({
        groupConfig: undefined,
        topicConfig: undefined,
      }),
      shouldSkipUpdate: () => false,
      opts: { token: "token" },
    });

    const ctx = {
      message: {
        chat: { id: 123, type: "private" },
        from: { id: 111, username: "nope" },
        message_id: 10,
        date: 123456,
      },
      match: "",
    };

    await handlers.plugin?.(ctx);

    expect(matchPluginCommand).toHaveBeenCalled();
    expect(executePluginCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthorizedSender: false,
      }),
    );
    expect(deliverReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        replies: [{ text: "ok" }],
      }),
    );
    expect(bot.api.sendMessage).not.toHaveBeenCalled();
  });
});
