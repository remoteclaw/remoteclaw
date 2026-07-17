import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config/config.js";
import { buildTelegramMessageContextForTest } from "./bot-message-context.test-harness.js";

const { defaultRouteConfig } = vi.hoisted(() => ({
  defaultRouteConfig: {
    agents: {
      list: [{ id: "alpha", default: true }, { id: "zu" }, { id: "q" }, { id: "support" }],
    },
    // This fork has no phantom "default" agent tier, so `default: true` above does NOT
    // make `alpha` the route for an unbound peer — with 4 agents configured, sole-agent
    // promotion does not apply either, and the base route would be dropped as unmatched
    // before any topic override could run. An explicit catch-all is what actually lands
    // an unbound peer on `alpha` here, which is the precondition these topic-override
    // cases assume (#2961).
    routing: { unmatched: { agent: "alpha" } },
    channels: { telegram: {} },
    messages: { groupChat: { mentionPatterns: [] } },
  },
}));

// Mock path repaired (#2961): these specifiers predate the src/telegram/ ->
// extensions/telegram/src/ move, so "../config/config.js" pointed at a module that does
// not exist. The mock silently never applied and `vi.mocked(loadConfig).mockReturnValue`
// threw "mockReturnValue is not a function", failing the whole file in beforeEach.
vi.mock("../../../src/config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/config/config.js")>();
  return {
    ...actual,
    loadConfig: vi.fn(() => defaultRouteConfig),
  };
});

describe("buildTelegramMessageContext per-topic agentId routing", () => {
  function buildForumMessage(threadId = 3) {
    return {
      message_id: 1,
      chat: {
        id: -1001234567890,
        type: "supergroup" as const,
        title: "Forum",
        is_forum: true,
      },
      date: 1700000000,
      text: "@bot hello",
      message_thread_id: threadId,
      from: { id: 42, first_name: "Alice" },
    };
  }

  async function buildForumContext(params: {
    threadId?: number;
    topicConfig?: Record<string, unknown>;
  }) {
    return await buildTelegramMessageContextForTest({
      message: buildForumMessage(params.threadId),
      options: { forceWasMentioned: true },
      resolveGroupActivation: () => true,
      resolveTelegramGroupConfig: () => ({
        groupConfig: { requireMention: false },
        ...(params.topicConfig ? { topicConfig: params.topicConfig } : {}),
      }),
    });
  }

  beforeEach(() => {
    vi.mocked(loadConfig).mockReturnValue(defaultRouteConfig as never);
  });

  it("uses group-level agent when no topic agentId is set", async () => {
    const ctx = await buildForumContext({ topicConfig: { systemPrompt: "Be nice" } });

    expect(ctx).not.toBeNull();
    expect(ctx?.ctxPayload?.SessionKey).toBe("agent:alpha:telegram:group:-1001234567890:topic:3");
  });

  it("routes to topic-specific agent when agentId is set", async () => {
    const ctx = await buildForumContext({
      topicConfig: { agentId: "zu", systemPrompt: "I am Zu" },
    });

    expect(ctx?.ctxPayload?.SessionKey).toContain("agent:zu:");
    expect(ctx?.ctxPayload?.SessionKey).toContain("telegram:group:-1001234567890:topic:3");
  });

  it("different topics route to different agents", async () => {
    const buildForTopic = async (threadId: number, agentId: string) =>
      await buildForumContext({ threadId, topicConfig: { agentId } });

    const ctxA = await buildForTopic(1, "alpha");
    const ctxB = await buildForTopic(3, "zu");
    const ctxC = await buildForTopic(5, "q");

    expect(ctxA?.ctxPayload?.SessionKey).toContain("agent:alpha:");
    expect(ctxB?.ctxPayload?.SessionKey).toContain("agent:zu:");
    expect(ctxC?.ctxPayload?.SessionKey).toContain("agent:q:");

    expect(ctxA?.ctxPayload?.SessionKey).not.toBe(ctxB?.ctxPayload?.SessionKey);
    expect(ctxB?.ctxPayload?.SessionKey).not.toBe(ctxC?.ctxPayload?.SessionKey);
  });

  it("preserves topic routing when Telegram omits chat.is_forum", async () => {
    const resolveTelegramGroupConfig = vi.fn(() => ({
      groupConfig: { requireMention: false },
      topicConfig: { agentId: "zu" },
    }));
    const ctx = await buildTelegramMessageContextForTest({
      message: {
        message_id: 1,
        chat: {
          id: -1001234567890,
          type: "supergroup",
          title: "Forum",
        },
        date: 1700000000,
        text: "@bot hello",
        is_topic_message: true,
        message_thread_id: 3,
        from: { id: 42, first_name: "Alice" },
      },
      options: { forceWasMentioned: true },
      resolveGroupActivation: () => true,
      resolveTelegramGroupConfig,
    });

    expect(resolveTelegramGroupConfig).toHaveBeenCalledWith(-1001234567890, 3);
    expect(ctx?.ctxPayload?.SessionKey).toContain("agent:zu:");
    expect(ctx?.ctxPayload?.SessionKey).toContain("telegram:group:-1001234567890:topic:3");
  });

  it("ignores whitespace-only agentId and uses group-level agent", async () => {
    const ctx = await buildForumContext({
      topicConfig: { agentId: "   ", systemPrompt: "Be nice" },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.ctxPayload?.SessionKey).toContain("agent:alpha:");
  });

  // GUT-PINNED (#2961): asserts the REMOVED upstream default-agent fallback — that an
  // unknown topic `agentId` resolves back to the agent flagged `default: true`. This fork
  // has no default-agent concept in routing (`default: true` is inert config; the contract
  // is pinned by test/default-agent-elimination.test.ts), and pickFirstExistingAgentId
  // (src/routing/resolve-route.ts) deliberately SANITIZED-PASSES-THROUGH an id that is not
  // in `agents.list` instead of falling back — it observed
  // `agent:ghost:telegram:group:-1001234567890:topic:3`. Whether an unconfigured topic
  // agentId should hard-fail rather than pass through is a shared-routing decision
  // affecting every caller of that helper, not an adapter fix — out of scope here.
  it.skip("falls back to default agent when topic agentId does not exist", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      agents: {
        list: [{ id: "alpha", default: true }, { id: "zu" }],
      },
      routing: { unmatched: { agent: "alpha" } },
      channels: { telegram: {} },
      messages: { groupChat: { mentionPatterns: [] } },
    } as never);

    const ctx = await buildForumContext({ topicConfig: { agentId: "ghost" } });

    expect(ctx).not.toBeNull();
    expect(ctx?.ctxPayload?.SessionKey).toContain("agent:alpha:");
  });

  it("routes DM topic to specific agent when agentId is set", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      message: {
        message_id: 1,
        chat: {
          id: 123456789,
          type: "private",
        },
        date: 1700000000,
        text: "@bot hello",
        message_thread_id: 99,
        from: { id: 42, first_name: "Alice" },
      },
      options: { forceWasMentioned: true },
      resolveGroupActivation: () => true,
      resolveTelegramGroupConfig: () => ({
        groupConfig: { requireMention: false },
        topicConfig: { agentId: "support", systemPrompt: "I am support" },
      }),
    });

    expect(ctx?.ctxPayload?.SessionKey).toContain("agent:support:");
  });
});
