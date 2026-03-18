import { expect, vi } from "vitest";
import type { TelegramBotDeps } from "./bot-deps.js";
import {
  createNativeCommandTestParams as createBaseNativeCommandTestParams,
  createTelegramPrivateCommandContext,
  type NativeCommandTestParams as RegisterTelegramNativeCommandsParams,
} from "./bot-native-commands.fixture-test-support.js";

type RegisteredCommand = {
  command: string;
  description: string;
};

const skillCommandMocks = vi.hoisted(() => ({
  listSkillCommandsForAgents: vi.fn(() => []),
}));

const deliveryMocks = vi.hoisted(() => ({
  deliverReplies: vi.fn(async () => ({ delivered: true })),
}));

export const listSkillCommandsForAgents = skillCommandMocks.listSkillCommandsForAgents;
export const deliverReplies = deliveryMocks.deliverReplies;

vi.mock("../../../src/auto-reply/skill-commands.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/auto-reply/skill-commands.js")>();
  return {
    ...actual,
    listSkillCommandsForAgents,
  };
});

vi.mock("./bot/delivery.js", () => ({
  deliverReplies,
}));

export async function waitForRegisteredCommands(
  setMyCommands: ReturnType<typeof vi.fn>,
): Promise<RegisteredCommand[]> {
  await vi.waitFor(() => {
    expect(setMyCommands).toHaveBeenCalled();
  });
  return setMyCommands.mock.calls[0]?.[0] as RegisteredCommand[];
}

export function resetNativeCommandMenuMocks() {
  listSkillCommandsForAgents.mockClear();
  listSkillCommandsForAgents.mockReturnValue([]);
  deliverReplies.mockClear();
  deliverReplies.mockResolvedValue({ delivered: true });
}

export function createCommandBot() {
  const commandHandlers = new Map<string, (ctx: unknown) => Promise<void>>();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const setMyCommands = vi.fn().mockResolvedValue(undefined);
  const bot = {
    api: {
      setMyCommands,
      sendMessage,
    },
    command: vi.fn((name: string, cb: (ctx: unknown) => Promise<void>) => {
      commandHandlers.set(name, cb);
    }),
  } as unknown as RegisterTelegramNativeCommandsParams["bot"];
  return { bot, commandHandlers, sendMessage, setMyCommands };
}

export function createNativeCommandTestParams(
  cfg: RemoteClawConfig,
  params: Partial<RegisterTelegramNativeCommandsParams> = {},
): RegisterTelegramNativeCommandsParams {
  const telegramDeps: TelegramBotDeps = {
    loadConfig: vi.fn(() => ({})),
    resolveStorePath: vi.fn((storePath?: string) => storePath ?? "/tmp/sessions.json"),
    readChannelAllowFromStore: vi.fn(async () => []),
    enqueueSystemEvent: vi.fn(),
    dispatchReplyWithBufferedBlockDispatcher: vi.fn(async () => ({
      queuedFinal: false,
      counts: {},
    })),
    listSkillCommandsForAgents,
    wasSentByBot: vi.fn(() => false),
  };
  return createBaseNativeCommandTestParams({
    cfg,
    runtime: params.runtime ?? ({} as RuntimeEnv),
    nativeSkillsEnabled: true,
    telegramDeps,
    ...params,
  });
}

export function createPrivateCommandContext(params?: {
  match?: string;
  messageId?: number;
  date?: number;
  chatId?: number;
  userId?: number;
  username?: string;
}) {
  return {
    match: params?.match ?? "",
    message: {
      message_id: params?.messageId ?? 1,
      date: params?.date ?? Math.floor(Date.now() / 1000),
      chat: { id: params?.chatId ?? 123, type: "private" as const },
      from: { id: params?.userId ?? 456, username: params?.username ?? "alice" },
    },
  };
}
