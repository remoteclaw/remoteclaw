import { ChannelType } from "discord-api-types/v10";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeCommandSpec } from "../../../../src/auto-reply/commands-registry.js";
import { setDefaultChannelPluginRegistryForTests } from "../../../../src/commands/channel-test-helpers.js";
import type { OpenClawConfig } from "../../../../src/config/config.js";
import { clearPluginCommands, registerPluginCommand } from "../../../../src/plugins/commands.js";
import { createDiscordNativeCommand } from "./native-command.js";
import {
  createMockCommandInteraction,
  type MockCommandInteraction,
} from "./native-command.test-helpers.js";
import { createNoopThreadBindingManager } from "./thread-bindings.js";

type EnsureConfiguredBindingRouteReadyFn =
  typeof import("openclaw/plugin-sdk/conversation-runtime").ensureConfiguredBindingRouteReady;
type MatchPluginCommandFn = typeof import("openclaw/plugin-sdk/plugin-runtime").matchPluginCommand;
type ExecutePluginCommandFn =
  typeof import("openclaw/plugin-sdk/plugin-runtime").executePluginCommand;
type DispatchReplyWithDispatcherFn =
  typeof import("openclaw/plugin-sdk/reply-runtime").dispatchReplyWithDispatcher;

const persistentBindingMocks = vi.hoisted(() => ({
  resolveConfiguredAcpBindingRecord: vi.fn<ResolveConfiguredAcpBindingRecordFn>(() => null),
  ensureConfiguredAcpBindingSession: vi.fn<EnsureConfiguredAcpBindingSessionFn>(async () => ({
    ok: true,
    sessionKey: "agent:codex:acp:binding:discord:default:seed",
  })),
);
const matchPluginCommandMockState = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof vi.fn<MatchPluginCommandFn>>,
}));
const executePluginCommandMockState = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof vi.fn<ExecutePluginCommandFn>>,
}));
const dispatchReplyWithDispatcherMockState = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof vi.fn<DispatchReplyWithDispatcherFn>>,
}));

vi.mock("openclaw/plugin-sdk/plugin-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/plugin-runtime")>();
  return {
    ...actual,
    matchPluginCommand: (...args: Parameters<MatchPluginCommandFn>) =>
      matchPluginCommandMockState.current
        ? matchPluginCommandMockState.current(...args)
        : actual.matchPluginCommand(...args),
    executePluginCommand: (...args: Parameters<ExecutePluginCommandFn>) =>
      executePluginCommandMockState.current
        ? executePluginCommandMockState.current(...args)
        : actual.executePluginCommand(...args),
  };
});

vi.mock("openclaw/plugin-sdk/reply-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/reply-runtime")>();
  return {
    ...actual,
    dispatchReplyWithDispatcher: (...args: Parameters<DispatchReplyWithDispatcherFn>) =>
      dispatchReplyWithDispatcherMockState.current
        ? dispatchReplyWithDispatcherMockState.current(...args)
        : actual.dispatchReplyWithDispatcher(...args),
  };
});

vi.mock("openclaw/plugin-sdk/conversation-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/conversation-runtime")>();
  return {
    ...actual,
    ensureConfiguredBindingRouteReady: (...args: unknown[]) =>
      ensureConfiguredBindingRouteReadyMock(
        ...(args as Parameters<EnsureConfiguredBindingRouteReadyFn>),
      ),
  };
});

vi.mock("openclaw/plugin-sdk/plugin-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/plugin-runtime")>();
  return {
    ...actual,
    matchPluginCommand: (...args: unknown[]) => runtimeModuleMocks.matchPluginCommand(...args),
    executePluginCommand: (...args: unknown[]) => runtimeModuleMocks.executePluginCommand(...args),
  };
});

vi.mock("openclaw/plugin-sdk/reply-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/reply-runtime")>();
  return {
    ...actual,
    dispatchReplyWithDispatcher: (...args: unknown[]) =>
      runtimeModuleMocks.dispatchReplyWithDispatcher(...args),
  };
});

function createInteraction(params?: {
  channelType?: ChannelType;
  channelId?: string;
  guildId?: string;
  guildName?: string;
}): MockCommandInteraction {
  return createMockCommandInteraction({
    userId: "owner",
    username: "tester",
    globalName: "Tester",
    channelType: params?.channelType ?? ChannelType.DM,
    channelId: params?.channelId ?? "dm-1",
    guildId: params?.guildId ?? null,
    guildName: params?.guildName,
    interactionId: "interaction-1",
  });
}

function createConfig(): RemoteClawConfig {
  return {
    channels: {
      discord: {
        dm: { enabled: true, policy: "open" },
      },
    },
  } as RemoteClawConfig;
}

async function loadCreateDiscordNativeCommand() {
  vi.resetModules();
  return (await import("./native-command.js")).createDiscordNativeCommand;
}

async function createNativeCommand(cfg: OpenClawConfig, commandSpec: NativeCommandSpec) {
  const createDiscordNativeCommand = await loadCreateDiscordNativeCommand();
  return createDiscordNativeCommand({
    command: commandSpec,
    cfg,
    discordConfig: cfg.channels?.discord ?? {},
    accountId: "default",
    sessionPrefix: "discord:slash",
    ephemeralDefault: true,
    threadBindings: createNoopThreadBindingManager("default"),
  });
}

function createPluginCommand(params: { cfg: RemoteClawConfig; name: string }) {
  return createDiscordNativeCommand({
    command: {
      name: params.name,
      description: "Pair",
      acceptsArgs: true,
    } satisfies NativeCommandSpec,
    cfg: params.cfg,
    discordConfig: params.cfg.channels?.discord ?? {},
    accountId: "default",
    sessionPrefix: "discord:slash",
    ephemeralDefault: true,
    threadBindings: createNoopThreadBindingManager("default"),
  });
}

function registerPairPlugin(params?: { discordNativeName?: string }) {
  expect(
    registerPluginCommand("demo-plugin", {
      name: "pair",
      ...(params?.discordNativeName
        ? {
            nativeNames: {
              telegram: "pair_device",
              discord: params.discordNativeName,
            },
          }
        : {}),
      description: "Pair device",
      acceptsArgs: true,
      requireAuth: false,
      handler: async ({ args }) => ({ text: `paired:${args ?? ""}` }),
    }),
  ).toEqual({ ok: true });
}

async function expectPairCommandReply(params: {
  cfg: RemoteClawConfig;
  commandName: string;
  interaction: MockCommandInteraction;
}) {
  const command = createPluginCommand({
    cfg: params.cfg,
    name: params.commandName,
  });
  const dispatchSpy = vi.fn<DispatchReplyWithDispatcherFn>().mockResolvedValue({} as never);
  dispatchReplyWithDispatcherMockState.current = dispatchSpy;

  await (command as { run: (interaction: unknown) => Promise<void> }).run(
    Object.assign(params.interaction, {
      options: {
        getString: () => "now",
        getBoolean: () => null,
        getFocused: () => "",
      },
    }) as unknown,
  );

  expect(dispatchSpy).not.toHaveBeenCalled();
  expect(params.interaction.reply).toHaveBeenCalledWith(
    expect.objectContaining({ content: "paired:now" }),
  );
}

function setConfiguredBinding(channelId: string, boundSessionKey: string) {
  persistentBindingMocks.resolveConfiguredAcpBindingRecord.mockReturnValue({
    spec: {
      channel: "discord",
      accountId: "default",
      conversationId: channelId,
      agentId: "codex",
      mode: "persistent",
    },
    record: {
      bindingId: `config:acp:discord:default:${channelId}`,
      targetSessionKey: boundSessionKey,
      targetKind: "session",
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: channelId,
      },
      status: "active",
      boundAt: 0,
    },
  });
  persistentBindingMocks.ensureConfiguredAcpBindingSession.mockResolvedValue({
    ok: true,
    sessionKey: boundSessionKey,
  });
}

function createDispatchSpy() {
  const dispatchSpy = vi.fn<DispatchReplyWithDispatcherFn>().mockResolvedValue({
    counts: {
      final: 1,
      block: 0,
      tool: 0,
    },
  } as never);
  dispatchReplyWithDispatcherMockState.current = dispatchSpy;
  return dispatchSpy;
}

function expectBoundSessionDispatch(
  dispatchSpy: ReturnType<typeof createDispatchSpy>,
  boundSessionKey: string,
) {
  expect(dispatchSpy).toHaveBeenCalledTimes(1);
  const dispatchCall = dispatchSpy.mock.calls[0]?.[0] as {
    ctx?: { SessionKey?: string; CommandTargetSessionKey?: string };
  };
  if (!dispatchCall.ctx?.SessionKey || !dispatchCall.ctx.CommandTargetSessionKey) {
    throw new Error("native command dispatch did not include bound session context");
  }
  expect(dispatchCall.ctx.SessionKey).toMatch(expectedPattern);
  expect(dispatchCall.ctx.CommandTargetSessionKey).toMatch(expectedPattern);
  expect(ensureConfiguredBindingRouteReadyMock).toHaveBeenCalledTimes(1);
}

async function expectBoundStatusCommandDispatch(params: {
  cfg: RemoteClawConfig;
  interaction: MockCommandInteraction;
  channelId: string;
  boundSessionKey: string;
}) {
  const command = await createStatusCommand(params.cfg);

  matchPluginCommandMockState.current = vi.fn<MatchPluginCommandFn>().mockReturnValue(null);
  const dispatchSpy = createDispatchSpy();
  const command = await createStatusCommand(params.cfg);

  await (command as { run: (interaction: unknown) => Promise<void> }).run(
    params.interaction as unknown,
  );

  expectBoundSessionDispatch(dispatchSpy, params.boundSessionKey);
}

describe("Discord native plugin command dispatch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearPluginCommands();
    setDefaultChannelPluginRegistryForTests();
    matchPluginCommandMockState.current = null;
    executePluginCommandMockState.current = null;
    dispatchReplyWithDispatcherMockState.current = null;
    ensureConfiguredBindingRouteReadyMock.mockReset();
    ensureConfiguredBindingRouteReadyMock.mockResolvedValue({
      ok: true,
      sessionKey: "agent:codex:acp:binding:discord:default:seed",
    });
    const actualPluginRuntime = await vi.importActual<
      typeof import("openclaw/plugin-sdk/plugin-runtime")
    >("openclaw/plugin-sdk/plugin-runtime");
    runtimeModuleMocks.matchPluginCommand.mockReset();
    runtimeModuleMocks.matchPluginCommand.mockImplementation(
      actualPluginRuntime.matchPluginCommand,
    );
    runtimeModuleMocks.executePluginCommand.mockReset();
    runtimeModuleMocks.executePluginCommand.mockImplementation(
      actualPluginRuntime.executePluginCommand,
    );
    runtimeModuleMocks.dispatchReplyWithDispatcher.mockReset();
    runtimeModuleMocks.dispatchReplyWithDispatcher.mockResolvedValue({
      counts: {
        final: 1,
        block: 0,
        tool: 0,
      },
    } as never);
  });

  it("executes plugin commands from the real registry through the native Discord command path", async () => {
    const cfg = createConfig();
    const commandSpec: NativeCommandSpec = {
      name: "pair",
      description: "Pair",
      acceptsArgs: true,
    };
    const command = createDiscordNativeCommand({
      command: commandSpec,
      cfg,
      discordConfig: cfg.channels?.discord ?? {},
      accountId: "default",
      sessionPrefix: "discord:slash",
      ephemeralDefault: true,
      threadBindings: createNoopThreadBindingManager("default"),
    });
    const interaction = createInteraction();

    expect(
      registerPluginCommand("demo-plugin", {
        name: "pair",
        description: "Pair device",
        acceptsArgs: true,
        requireAuth: false,
        handler: async ({ args }) => ({ text: `paired:${args ?? ""}` }),
      }),
    ).toEqual({ ok: true });

    const executeSpy = runtimeModuleMocks.executePluginCommand;
    const dispatchSpy = runtimeModuleMocks.dispatchReplyWithDispatcher.mockResolvedValue(
      {} as never,
    );

    await (command as { run: (interaction: unknown) => Promise<void> }).run(
      Object.assign(interaction, {
        options: {
          getString: () => "now",
          getBoolean: () => null,
          getFocused: () => "",
        },
      }) as unknown,
    );

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "paired:now" }),
    );
  });

  it("blocks unauthorized Discord senders before requireAuth:false plugin commands execute", async () => {
    const cfg = {
      commands: {
        allowFrom: {
          discord: ["user:123456789012345678"],
        },
      },
      channels: {
        discord: {
          groupPolicy: "allowlist",
          guilds: {
            "345678901234567890": {
              channels: {
                "234567890123456789": {
                  allow: true,
                  requireMention: false,
                },
              },
            },
          },
        },
      },
    } as OpenClawConfig;
    const commandSpec: NativeCommandSpec = {
      name: "pair",
      description: "Pair",
      acceptsArgs: true,
    };
    const command = createDiscordNativeCommand({
      command: commandSpec,
      cfg,
      discordConfig: cfg.channels?.discord ?? {},
      accountId: "default",
      sessionPrefix: "discord:slash",
      ephemeralDefault: true,
      threadBindings: createNoopThreadBindingManager("default"),
    });
    const interaction = createInteraction({
      channelType: ChannelType.GuildText,
      channelId: "234567890123456789",
      guildId: "345678901234567890",
      guildName: "Test Guild",
    });
    interaction.user.id = "999999999999999999";
    interaction.options.getString.mockReturnValue("now");

    expect(
      registerPluginCommand("demo-plugin", {
        name: "pair",
        description: "Pair device",
        acceptsArgs: true,
        requireAuth: false,
        handler: async ({ args }) => ({ text: `open:${args ?? ""}` }),
      }),
    ).toEqual({ ok: true });

    const executeSpy = vi.fn<ExecutePluginCommandFn>();
    executePluginCommandMockState.current = executeSpy;
    const dispatchSpy = createDispatchSpy();

    await (command as { run: (interaction: unknown) => Promise<void> }).run(interaction as unknown);

    expect(executeSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "You are not authorized to use this command.",
        ephemeral: true,
      }),
    );
  });

  it("executes matched plugin commands directly without invoking the agent dispatcher", async () => {
    const cfg = createConfig();
    const commandSpec: NativeCommandSpec = {
      name: "cron_jobs",
      description: "List cron jobs",
      acceptsArgs: false,
    };
    const interaction = createInteraction();
    const pluginMatch = {
      command: {
        name: "cron_jobs",
        description: "List cron jobs",
        pluginId: "cron-jobs",
        acceptsArgs: false,
        handler: vi.fn().mockResolvedValue({ text: "jobs" }),
      },
      args: undefined,
    };

    matchPluginCommandMockState.current = vi
      .fn<MatchPluginCommandFn>()
      .mockReturnValue(pluginMatch as ReturnType<MatchPluginCommandFn>);
    const executeSpy = vi
      .fn<ExecutePluginCommandFn>()
      .mockResolvedValue({ text: "direct plugin output" });
    executePluginCommandMockState.current = executeSpy;
    const dispatchSpy = createDispatchSpy();

    await (command as { run: (interaction: unknown) => Promise<void> }).run(interaction as unknown);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "direct plugin output" }),
    );
  });

  it("routes native slash commands through configured ACP Discord channel bindings", async () => {
    const guildId = "1459246755253325866";
    const channelId = "1478836151241412759";
    const boundSessionKey = "agent:codex:acp:binding:discord:default:feedface";
    const cfg = {
      commands: {
        useAccessGroups: false,
      },
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: channelId },
          },
          acp: {
            mode: "persistent",
          },
        },
      ],
    } as RemoteClawConfig;
    const interaction = createInteraction({
      channelType: ChannelType.GuildText,
      channelId,
      guildId,
      guildName: "Ops",
    });

    await expectBoundStatusCommandDispatch({
      cfg,
      interaction,
      channelId,
      boundSessionKey,
    });
  });

  it("falls back to the routed slash and channel session keys when no bound session exists", async () => {
    const guildId = "1459246755253325866";
    const channelId = "1478836151241412759";
    const cfg = {
      commands: {
        useAccessGroups: false,
      },
      bindings: [
        {
          agentId: "qwen",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: channelId },
            guildId,
          },
        },
      ],
      channels: {
        discord: {
          guilds: {
            [guildId]: {
              channels: {
                [channelId]: { allow: true, requireMention: false },
              },
            },
          },
        },
      },
    } as OpenClawConfig;
    const interaction = createInteraction({
      channelType: ChannelType.GuildText,
      channelId,
      guildId,
      guildName: "Ops",
    });

    matchPluginCommandMockState.current = vi.fn<MatchPluginCommandFn>().mockReturnValue(null);
    const dispatchSpy = createDispatchSpy();
    const command = await createStatusCommand(cfg);

    await (command as { run: (interaction: unknown) => Promise<void> }).run(interaction as unknown);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchCall = dispatchSpy.mock.calls[0]?.[0] as {
      ctx?: { SessionKey?: string; CommandTargetSessionKey?: string };
    };
    expect(dispatchCall.ctx?.SessionKey).toBe("agent:qwen:discord:slash:owner");
    expect(dispatchCall.ctx?.CommandTargetSessionKey).toBe(
      "agent:qwen:discord:channel:1478836151241412759",
    );
    expect(persistentBindingMocks.resolveConfiguredAcpBindingRecord).toHaveBeenCalledTimes(1);
    expect(persistentBindingMocks.ensureConfiguredAcpBindingSession).not.toHaveBeenCalled();
  });

  it("routes Discord DM native slash commands through configured ACP bindings", async () => {
    const channelId = "dm-1";
    const boundSessionKey = "agent:codex:acp:binding:discord:default:dmfeedface";
    const cfg = {
      commands: {
        useAccessGroups: false,
      },
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "direct", id: channelId },
          },
          acp: {
            mode: "persistent",
          },
        },
      ],
      channels: {
        discord: {
          dm: { enabled: true, policy: "open" },
        },
      },
    } as RemoteClawConfig;
    const interaction = createInteraction({
      channelType: ChannelType.DM,
      channelId,
    });

    await expectBoundStatusCommandDispatch({
      cfg,
      interaction,
      channelId,
      boundSessionKey,
    });
    ensureConfiguredBindingRouteReadyMock.mockResolvedValue({
      ok: false,
      error: "acpx exited with code 1",
    });
    runtimeModuleMocks.matchPluginCommand.mockReturnValue(null);
    const dispatchSpy = createDispatchSpy();
    const command = await createNativeCommand(cfg, {
      name: "new",
      description: "Start a new session.",
      acceptsArgs: true,
    });

    ensureConfiguredBindingRouteReadyMock.mockResolvedValue({
      ok: false,
      error: "acpx exited with code 1",
    });
    matchPluginCommandMockState.current = vi.fn<MatchPluginCommandFn>().mockReturnValue(null);
    const dispatchSpy = createDispatchSpy();

    await (command as { run: (interaction: unknown) => Promise<void> }).run(interaction as unknown);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchCall = dispatchSpy.mock.calls[0]?.[0] as {
      ctx?: { SessionKey?: string; CommandTargetSessionKey?: string };
    };
    expect(dispatchCall.ctx?.SessionKey).toMatch(/^agent:codex:acp:binding:discord:default:/);
    expect(dispatchCall.ctx?.CommandTargetSessionKey).toMatch(
      /^agent:codex:acp:binding:discord:default:/,
    );
    expect(ensureConfiguredBindingRouteReadyMock).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Configured ACP binding is unavailable right now. Please try again.",
      }),
    );
  });
});
