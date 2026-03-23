import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import type { ChannelGroupPolicy } from "remoteclaw/plugin-sdk/config-runtime";
import type { TelegramAccountConfig } from "remoteclaw/plugin-sdk/config-runtime";
import type { RuntimeEnv } from "remoteclaw/plugin-sdk/runtime-env";
import type { MockFn } from "remoteclaw/plugin-sdk/testing";
import { vi } from "vitest";
import {
  createNativeCommandTestParams,
  type NativeCommandTestParams,
} from "./bot-native-commands.fixture-test-support.js";
import { registerTelegramNativeCommands } from "./bot-native-commands.js";

type GetPluginCommandSpecsFn =
  typeof import("remoteclaw/plugin-sdk/plugin-runtime").getPluginCommandSpecs;
type MatchPluginCommandFn = typeof import("remoteclaw/plugin-sdk/plugin-runtime").matchPluginCommand;
type ExecutePluginCommandFn =
  typeof import("../../../src/plugins/commands.js").executePluginCommand;
type DispatchReplyWithBufferedBlockDispatcherFn =
  typeof import("../../../src/auto-reply/reply/provider-dispatcher.js").dispatchReplyWithBufferedBlockDispatcher;
type DispatchReplyWithBufferedBlockDispatcherResult = Awaited<
  ReturnType<DispatchReplyWithBufferedBlockDispatcherFn>
>;
type RecordInboundSessionMetaSafeFn =
  typeof import("../../../src/channels/session-meta.js").recordInboundSessionMetaSafe;
type AnyMock = MockFn<(...args: unknown[]) => unknown>;
type AnyAsyncMock = MockFn<(...args: unknown[]) => Promise<unknown>>;
type NativeCommandHarness = {
  handlers: Record<string, (ctx: unknown) => Promise<void>>;
  sendMessage: AnyAsyncMock;
  setMyCommands: AnyAsyncMock;
  log: AnyMock;
  bot: {
    api: {
      setMyCommands: AnyAsyncMock;
      sendMessage: AnyAsyncMock;
    };
    command: (name: string, handler: (ctx: unknown) => Promise<void>) => void;
  };
};

const pluginCommandMocks = vi.hoisted(() => ({
  getPluginCommandSpecs: vi.fn<GetPluginCommandSpecsFn>(() => []),
  matchPluginCommand: vi.fn<MatchPluginCommandFn>(() => null),
  executePluginCommand: vi.fn<ExecutePluginCommandFn>(async () => ({ text: "ok" })),
}));
export const getPluginCommandSpecs = pluginCommandMocks.getPluginCommandSpecs;
export const matchPluginCommand = pluginCommandMocks.matchPluginCommand;
export const executePluginCommand = pluginCommandMocks.executePluginCommand;

vi.mock("remoteclaw/plugin-sdk/plugin-runtime", () => ({
  getPluginCommandSpecs: pluginCommandMocks.getPluginCommandSpecs,
  matchPluginCommand: pluginCommandMocks.matchPluginCommand,
  executePluginCommand: pluginCommandMocks.executePluginCommand,
}));

const replyPipelineMocks = vi.hoisted(() => {
  const dispatchReplyResult: DispatchReplyWithBufferedBlockDispatcherResult = {
    queuedFinal: false,
    counts: {} as DispatchReplyWithBufferedBlockDispatcherResult["counts"],
  };
  return {
    finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
    dispatchReplyWithBufferedBlockDispatcher: vi.fn<DispatchReplyWithBufferedBlockDispatcherFn>(
      async () => dispatchReplyResult,
    ),
    createChannelReplyPipeline: vi.fn(() => ({ onModelSelected: () => {} })),
    recordInboundSessionMetaSafe: vi.fn<RecordInboundSessionMetaSafeFn>(async () => undefined),
  };
});
export const dispatchReplyWithBufferedBlockDispatcher =
  replyPipelineMocks.dispatchReplyWithBufferedBlockDispatcher;

vi.mock("remoteclaw/plugin-sdk/reply-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("remoteclaw/plugin-sdk/reply-runtime")>();
  return {
    ...actual,
    finalizeInboundContext: replyPipelineMocks.finalizeInboundContext,
    dispatchReplyWithBufferedBlockDispatcher:
      replyPipelineMocks.dispatchReplyWithBufferedBlockDispatcher,
  };
});
vi.mock("remoteclaw/plugin-sdk/channel-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("remoteclaw/plugin-sdk/channel-runtime")>();
  return {
    ...actual,
    recordInboundSessionMetaSafe: replyPipelineMocks.recordInboundSessionMetaSafe,
  };
});
vi.mock("remoteclaw/plugin-sdk/channel-reply-pipeline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("remoteclaw/plugin-sdk/channel-reply-pipeline")>();
  return {
    ...actual,
    createChannelReplyPipeline: replyPipelineMocks.createChannelReplyPipeline,
  };
});

const deliveryMocks = vi.hoisted(() => ({
  deliverReplies: vi.fn(async () => {}),
}));
export const deliverReplies = deliveryMocks.deliverReplies;
vi.mock("./bot/delivery.js", () => ({ deliverReplies: deliveryMocks.deliverReplies }));
vi.mock("./bot/delivery.replies.js", () => ({ deliverReplies: deliveryMocks.deliverReplies }));
export { createNativeCommandTestParams };

export function createNativeCommandsHarness(params?: {
  cfg?: RemoteClawConfig;
  runtime?: RuntimeEnv;
  accountId?: string;
  telegramCfg?: TelegramAccountConfig;
  allowFrom?: string[];
  groupAllowFrom?: string[];
  replyToMode?: RegisterTelegramNativeCommandParams["replyToMode"];
  textLimit?: number;
  useAccessGroups?: boolean;
  nativeEnabled?: boolean;
  groupConfig?: Record<string, unknown>;
  resolveGroupPolicy?: () => ChannelGroupPolicy;
}): NativeCommandHarness {
  const handlers: Record<string, (ctx: unknown) => Promise<void>> = {};
  const sendMessage: AnyAsyncMock = vi.fn(async () => undefined);
  const setMyCommands: AnyAsyncMock = vi.fn(async () => undefined);
  const log: AnyMock = vi.fn();
  const telegramDeps = {
    loadConfig: vi.fn(() => params?.cfg ?? ({} as RemoteClawConfig)),
    resolveStorePath: vi.fn((storePath?: string) => storePath ?? "/tmp/sessions.json"),
    readChannelAllowFromStore: vi.fn(async () => []),
    upsertChannelPairingRequest: vi.fn(async () => ({ code: "PAIRCODE", created: true })),
    enqueueSystemEvent: vi.fn(),
    dispatchReplyWithBufferedBlockDispatcher:
      replyPipelineMocks.dispatchReplyWithBufferedBlockDispatcher,
    buildModelsProviderData: vi.fn(async () => ({
      byProvider: new Map<string, Set<string>>(),
      providers: [],
      resolvedDefault: { provider: "openai", model: "gpt-4.1" },
    })),
    listSkillCommandsForAgents: vi.fn(() => []),
    wasSentByBot: vi.fn(() => false),
  };
  const bot = {
    api: {
      setMyCommands,
      sendMessage,
    },
    command: (name: string, handler: (ctx: unknown) => Promise<void>) => {
      handlers[name] = handler;
    },
  } as const;

  registerTelegramNativeCommands({
    bot: bot as unknown as NativeCommandTestParams["bot"],
    cfg: params?.cfg ?? ({} as RemoteClawConfig),
    runtime: params?.runtime ?? ({ log } as unknown as RuntimeEnv),
    accountId: "default",
    telegramCfg: params?.telegramCfg ?? ({} as TelegramAccountConfig),
    allowFrom: params?.allowFrom ?? [],
    groupAllowFrom: params?.groupAllowFrom ?? [],
    replyToMode: "off",
    textLimit: 4000,
    useAccessGroups: params?.useAccessGroups ?? false,
    nativeEnabled: params?.nativeEnabled ?? true,
    nativeSkillsEnabled: false,
    nativeDisabledExplicit: false,
    resolveGroupPolicy:
      params?.resolveGroupPolicy ??
      (() =>
        ({
          allowlistEnabled: false,
          allowed: true,
        }) as ChannelGroupPolicy),
    resolveTelegramGroupConfig: () => ({
      groupConfig: params?.groupConfig as undefined,
      topicConfig: undefined,
    }),
    shouldSkipUpdate: () => false,
    opts: { token: "token" },
  });

  return { handlers, sendMessage, setMyCommands, log, bot };
}

export function createTelegramGroupCommandContext(params?: {
  senderId?: number;
  username?: string;
  threadId?: number;
}) {
  return {
    bot: params.bot,
    cfg: params.cfg ?? { agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] } },
    runtime: params.runtime ?? ({} as RuntimeEnv),
    accountId: params.accountId ?? "default",
    telegramCfg: params.telegramCfg ?? ({} as TelegramAccountConfig),
    allowFrom: params.allowFrom ?? [],
    groupAllowFrom: params.groupAllowFrom ?? [],
    replyToMode: params.replyToMode ?? "off",
    textLimit: params.textLimit ?? 4096,
    useAccessGroups: params.useAccessGroups ?? false,
    nativeEnabled: params.nativeEnabled ?? true,
    nativeSkillsEnabled: false,
    nativeDisabledExplicit: params.nativeDisabledExplicit ?? false,
    resolveGroupPolicy: () => ({ allowlistEnabled: false, allowed: true }),
    resolveTelegramGroupConfig:
      params.resolveTelegramGroupConfig ??
      (() => ({
        groupConfig: undefined,
        topicConfig: undefined,
      })),
    shouldSkipUpdate: () => false,
    opts: params.opts ?? { token: "token" },
  };
}
