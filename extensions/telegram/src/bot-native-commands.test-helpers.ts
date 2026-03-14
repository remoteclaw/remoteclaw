import { vi } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type { ChannelGroupPolicy } from "../../../src/config/group-policy.js";
import type { TelegramAccountConfig } from "../../../src/config/types.js";
import type { RuntimeEnv } from "../../../src/runtime.js";
import type { MockFn } from "../../../src/test-utils/vitest-mock-fn.js";
import { registerTelegramNativeCommands } from "./bot-native-commands.js";

type RegisterTelegramNativeCommandsParams = Parameters<typeof registerTelegramNativeCommands>[0];
type GetPluginCommandSpecsFn =
  typeof import("../../../src/plugins/commands.js").getPluginCommandSpecs;
type MatchPluginCommandFn = typeof import("../../../src/plugins/commands.js").matchPluginCommand;
type ExecutePluginCommandFn =
  typeof import("../../../src/plugins/commands.js").executePluginCommand;
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

vi.mock("../../../src/plugins/commands.js", () => ({
  getPluginCommandSpecs: pluginCommandMocks.getPluginCommandSpecs,
  matchPluginCommand: pluginCommandMocks.matchPluginCommand,
  executePluginCommand: pluginCommandMocks.executePluginCommand,
}));

const deliveryMocks = vi.hoisted(() => ({
  deliverReplies: vi.fn(async () => {}),
}));
export const deliverReplies = deliveryMocks.deliverReplies;
vi.mock("./bot/delivery.js", () => ({ deliverReplies: deliveryMocks.deliverReplies }));
vi.mock("../../../src/pairing/pairing-store.js", () => ({
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
