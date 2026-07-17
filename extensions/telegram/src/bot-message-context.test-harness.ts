import { vi } from "vitest";
import { setRuntimeConfigSnapshot } from "../../../src/config/config.js";
import type { BuildTelegramMessageContextParams, TelegramMediaRef } from "./bot-message-context.js";
import { finalizeTelegramInboundContextForTest } from "./bot-message-context.session-runtime-test-support.js";

export const baseTelegramMessageContextConfig = {
  agents: {
    // Routing in this fork is fail-closed: there is no phantom "default" agent, so a
    // config with no `agents.list` matches NOTHING and every inbound message is dropped
    // by the `routing.unmatched` policy (#2961). Production configs always carry a
    // non-empty `agents.list` (schema-enforced), so one agent is the realistic minimum
    // for these fixtures — it exercises sole-agent promotion (`fallback.soleAgent`),
    // which is exactly what a single-agent deployment does.
    list: [{ id: "main" }],
    defaults: { model: "anthropic/claude-opus-4-5", workspace: "/tmp/remoteclaw" },
  },
  channels: { telegram: { dmPolicy: "open", allowFrom: ["*"] } },
  messages: { groupChat: { mentionPatterns: [] } },
} as never;

type BuildTelegramMessageContextForTestParams = {
  message: Record<string, unknown>;
  allMedia?: TelegramMediaRef[];
  options?: BuildTelegramMessageContextParams["options"];
  cfg?: Record<string, unknown>;
  accountId?: string;
  resolveGroupActivation?: BuildTelegramMessageContextParams["resolveGroupActivation"];
  resolveGroupRequireMention?: BuildTelegramMessageContextParams["resolveGroupRequireMention"];
  resolveTelegramGroupConfig?: BuildTelegramMessageContextParams["resolveTelegramGroupConfig"];
};

export async function buildTelegramMessageContextForTest(
  params: BuildTelegramMessageContextForTestParams,
): Promise<
  Awaited<ReturnType<typeof import("./bot-message-context.js").buildTelegramMessageContext>>
> {
  const { buildTelegramMessageContext } = await import("./bot-message-context.js");
  const cfg = (params.cfg ?? baseTelegramMessageContextConfig) as never;
  // Inbound routing deliberately reads a FRESH config via `loadConfig()` (bindings can
  // change at runtime) rather than the injected `cfg`, so publish the fixture as the
  // runtime snapshot — otherwise `loadConfig()` returns the empty config of the isolated
  // test HOME, nothing routes, and every context is dropped as unmatched (#2961).
  // Tests that mock `loadConfig` directly (e.g. topic-agentid) are unaffected.
  setRuntimeConfigSnapshot(cfg);
  return await buildTelegramMessageContext({
    primaryCtx: {
      message: {
        message_id: 1,
        date: 1_700_000_000,
        text: "hello",
        from: { id: 42, first_name: "Alice" },
        ...params.message,
      },
      me: { id: 7, username: "bot" },
    } as never,
    allMedia: params.allMedia ?? [],
    storeAllowFrom: [],
    options: params.options ?? {},
    bot: {
      api: {
        sendChatAction: vi.fn(),
        setMessageReaction: vi.fn(),
      },
    } as never,
    cfg,
    account: { accountId: params.accountId ?? "default" } as never,
    historyLimit: 0,
    groupHistories: new Map(),
    dmPolicy: "open",
    allowFrom: ["*"],
    groupAllowFrom: [],
    ackReactionScope: "off",
    logger: { info: vi.fn() },
    resolveGroupActivation: params.resolveGroupActivation ?? (() => undefined),
    resolveGroupRequireMention: params.resolveGroupRequireMention ?? (() => false),
    resolveTelegramGroupConfig:
      params.resolveTelegramGroupConfig ??
      (() => ({
        groupConfig: { requireMention: false },
        topicConfig: undefined,
      })),
    sendChatActionHandler: { sendChatAction: vi.fn() } as never,
  });
}
