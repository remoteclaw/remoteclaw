import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import type { ChannelGroupPolicy } from "remoteclaw/plugin-sdk/config-runtime";
import type { TelegramAccountConfig } from "remoteclaw/plugin-sdk/config-runtime";
import type { RuntimeEnv } from "remoteclaw/plugin-sdk/runtime-env";
import type { MockFn } from "remoteclaw/plugin-sdk/testing";
import { vi } from "vitest";
import { registerTelegramNativeCommands } from "./bot-native-commands.js";

type RegisterTelegramNativeCommandsParams = Parameters<typeof registerTelegramNativeCommands>[0];
type GetPluginCommandSpecsFn =
  typeof import("remoteclaw/plugin-sdk/plugin-runtime").getPluginCommandSpecs;
type MatchPluginCommandFn = typeof import("remoteclaw/plugin-sdk/plugin-runtime").matchPluginCommand;
type ExecutePluginCommandFn =
  typeof import("remoteclaw/plugin-sdk/plugin-runtime").executePluginCommand;
type DispatchReplyWithBufferedBlockDispatcherFn =
  typeof import("remoteclaw/plugin-sdk/reply-runtime").dispatchReplyWithBufferedBlockDispatcher;
type DispatchReplyWithBufferedBlockDispatcherResult = Awaited<
  ReturnType<DispatchReplyWithBufferedBlockDispatcherFn>
>;
type RecordInboundSessionMetaSafeFn =
  typeof import("remoteclaw/plugin-sdk/conversation-runtime").recordInboundSessionMetaSafe;
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
    createReplyPrefixOptions: vi.fn(() => ({ onModelSelected: () => {} })),
    recordInboundSessionMetaSafe: vi.fn<RecordInboundSessionMetaSafeFn>(async () => undefined),
  };
});
export const dispatchReplyWithBufferedBlockDispatcher =
  replyPipelineMocks.dispatchReplyWithBufferedBlockDispatcher;

vi.mock("openclaw/plugin-sdk/reply-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/reply-runtime")>();
  return {
    ...actual,
    finalizeInboundContext: replyPipelineMocks.finalizeInboundContext,
    dispatchReplyWithBufferedBlockDispatcher:
      replyPipelineMocks.dispatchReplyWithBufferedBlockDispatcher,
  };
});
vi.mock("openclaw/plugin-sdk/channel-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/channel-runtime")>();
  return {
    ...actual,
    createReplyPrefixOptions: replyPipelineMocks.createReplyPrefixOptions,
    recordInboundSessionMetaSafe: replyPipelineMocks.recordInboundSessionMetaSafe,
  };
});

const deliveryMocks = vi.hoisted(() => ({
  deliverReplies: vi.fn(async () => {}),
}));
export const deliverReplies = deliveryMocks.deliverReplies;
vi.mock("./bot/delivery.js", () => ({ deliverReplies: deliveryMocks.deliverReplies }));
vi.mock("openclaw/plugin-sdk/conversation-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/conversation-runtime")>();
  return {
    ...actual,
    readChannelAllowFromStore: vi.fn(async () => []),
  };
});
export { createNativeCommandTestParams };

export function createNativeCommandsHarness(params?: {
  cfg?: RemoteClawConfig;
  runtime?: RuntimeEnv;
  telegramCfg?: TelegramAccountConfig;
  allowFrom?: string[];
  groupAllowFrom?: string[];
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
    loadConfig: vi.fn(() => params?.cfg ?? ({} as OpenClawConfig)),
    resolveStorePath: vi.fn((storePath?: string) => storePath ?? "/tmp/sessions.json"),
    readChannelAllowFromStore: vi.fn(async () => []),
    enqueueSystemEvent: vi.fn(),
    dispatchReplyWithBufferedBlockDispatcher:
      replyPipelineMocks.dispatchReplyWithBufferedBlockDispatcher,
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
  } as unknown as RegisterTelegramNativeCommandsParams["bot"];

  registerTelegramNativeCommands({
    bot,
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
    telegramDeps,
    resolveGroupPolicy:
      params.resolveGroupPolicy ??
      (() =>
        ({
          allowlistEnabled: false,
          allowed: true,
        }) as ReturnType<RegisterTelegramNativeCommandsParams["resolveGroupPolicy"]>),
    resolveTelegramGroupConfig:
      params.resolveTelegramGroupConfig ??
      (() => ({ groupConfig: undefined, topicConfig: undefined })),
    shouldSkipUpdate: params.shouldSkipUpdate ?? (() => false),
    opts: params.opts ?? { token: "token" },
  };
}

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
  nativeDisabledExplicit?: boolean;
  resolveTelegramGroupConfig?: RegisterTelegramNativeCommandParams["resolveTelegramGroupConfig"];
  opts?: RegisterTelegramNativeCommandParams["opts"];
}): RegisterTelegramNativeCommandParams {
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
