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
  typeof import("remoteclaw/plugin-sdk/channel-runtime").recordInboundSessionMetaSafe;
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

vi.mock("remoteclaw/plugin-sdk/reply-runtime", () => ({
  finalizeInboundContext: replyPipelineMocks.finalizeInboundContext,
}));
vi.mock("remoteclaw/plugin-sdk/reply-runtime", () => ({
  dispatchReplyWithBufferedBlockDispatcher:
    replyPipelineMocks.dispatchReplyWithBufferedBlockDispatcher,
}));
vi.mock("remoteclaw/plugin-sdk/channel-runtime", () => ({
  createReplyPrefixOptions: replyPipelineMocks.createReplyPrefixOptions,
}));
vi.mock("remoteclaw/plugin-sdk/channel-runtime", () => ({
  recordInboundSessionMetaSafe: replyPipelineMocks.recordInboundSessionMetaSafe,
}));

const deliveryMocks = vi.hoisted(() => ({
  deliverReplies: vi.fn(async () => {}),
}));
export const deliverReplies = deliveryMocks.deliverReplies;
vi.mock("./bot/delivery.js", () => ({ deliverReplies: deliveryMocks.deliverReplies }));
vi.mock("remoteclaw/plugin-sdk/conversation-runtime", () => ({
  readChannelAllowFromStore: vi.fn(async () => []),
}));

export function createNativeCommandTestParams(
  params: Partial<RegisterTelegramNativeCommandsParams> = {},
): RegisterTelegramNativeCommandsParams {
  const log = vi.fn();
  return {
    bot:
      params.bot ??
      ({
        api: {
          setMyCommands: vi.fn().mockResolvedValue(undefined),
          sendMessage: vi.fn().mockResolvedValue(undefined),
        },
        command: vi.fn(),
      } as unknown as RegisterTelegramNativeCommandsParams["bot"]),
    cfg: params.cfg ?? ({} as RemoteClawConfig),
    runtime:
      params.runtime ?? ({ log } as unknown as RegisterTelegramNativeCommandsParams["runtime"]),
    accountId: params.accountId ?? "default",
    telegramCfg: params.telegramCfg ?? ({} as RegisterTelegramNativeCommandsParams["telegramCfg"]),
    allowFrom: params.allowFrom ?? [],
    groupAllowFrom: params.groupAllowFrom ?? [],
    replyToMode: params.replyToMode ?? "off",
    textLimit: params.textLimit ?? 4000,
    useAccessGroups: params.useAccessGroups ?? false,
    nativeEnabled: params.nativeEnabled ?? true,
    nativeSkillsEnabled: params.nativeSkillsEnabled ?? false,
    nativeDisabledExplicit: params.nativeDisabledExplicit ?? false,
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
