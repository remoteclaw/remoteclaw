import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDefaultMediaLocalRoots: vi.fn(() => []),
  dispatchChannelMessageAction: vi.fn(),
  sendMessage: vi.fn(),
  sendPoll: vi.fn(),
  getAgentScopedMediaLocalRoots: vi.fn(() => ["/tmp/agent-roots"]),
}));

vi.mock("../../channels/plugins/message-actions.js", () => ({
  dispatchChannelMessageAction: mocks.dispatchChannelMessageAction,
}));

vi.mock("./message.js", () => ({
  sendMessage: mocks.sendMessage,
  sendPoll: mocks.sendPoll,
}));

vi.mock("../../media/local-roots.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../media/local-roots.js")>();
  return {
    ...actual,
    getDefaultMediaLocalRoots: mocks.getDefaultMediaLocalRoots,
    getAgentScopedMediaLocalRoots: mocks.getAgentScopedMediaLocalRoots,
  };
});

import { executePollAction, executeSendAction } from "./outbound-send-service.js";

describe("executeSendAction", () => {
  function pluginActionResult(messageId: string) {
    return {
      ok: true,
      value: { messageId },
      continuePrompt: "",
      output: "",
      sessionId: "s1",
      model: "gpt-5.4",
      usage: {},
    };
  }

  function expectMirrorWrite(
    expected: Partial<{
      agentId: string;
      sessionKey: string;
      text: string;
      idempotencyKey: string;
      mediaUrls: string[];
    }>,
  ) {
    expect(mocks.appendAssistantMessageToSessionTranscript).toHaveBeenCalledWith(
      expect.objectContaining(expected),
    );
  }

  async function executePluginMirroredSend(params: {
    mirror?: Partial<{
      sessionKey: string;
      agentId?: string;
      idempotencyKey?: string;
    }>;
    mediaUrls?: string[];
  }) {
    mocks.dispatchChannelMessageAction.mockResolvedValue(pluginActionResult("msg-plugin"));

    await executeSendAction({
      ctx: {
        cfg: {},
        channel: "demo-outbound",
        params: { to: "channel:123", message: "hello" },
        dryRun: false,
        mirror: {
          sessionKey: "agent:main:demo-outbound:channel:123",
          ...params.mirror,
        },
      },
      to: "channel:123",
      message: "hello",
      mediaUrls: params.mediaUrls,
    });
  }

  function createPluginMediaSendContext(
    overrides: Partial<ExecuteSendContext>,
  ): ExecuteSendContext {
    return {
      cfg: {},
      channel: "demo-outbound",
      params: { media: "/tmp/host.png" },
      sessionKey: "agent:main:directchat:group:ops",
      dryRun: false,
      ...overrides,
    } as ExecuteSendContext;
  }

  async function executePluginMediaSend(ctx: Partial<ExecuteSendContext>) {
    mocks.dispatchChannelMessageAction.mockResolvedValue(pluginActionResult("msg-plugin"));

    await executeSendAction({
      ctx: createPluginMediaSendContext(ctx),
      to: "channel:123",
      message: "hello",
    });
  }

  beforeAll(async () => {
    ({ executePollAction, executeSendAction } = await import("./outbound-send-service.js"));
  });

  beforeEach(() => {
    mocks.dispatchChannelMessageAction.mockClear();
    mocks.sendMessage.mockClear();
    mocks.sendPoll.mockClear();
    mocks.getDefaultMediaLocalRoots.mockClear();
    mocks.getAgentScopedMediaLocalRoots.mockClear();
  });

  it("forwards ctx.agentId to sendMessage on core outbound path", async () => {
    mocks.dispatchChannelMessageAction.mockResolvedValue(null);
    mocks.sendMessage.mockResolvedValue({
      channel: "discord",
      to: "channel:123",
      via: "direct",
      mediaUrl: null,
    });

    await executeSendAction({
      ctx: {
        cfg: {},
        channel: "discord",
        params: {},
        agentId: "work",
        dryRun: false,
      },
      to: "channel:123",
      message: "hello",
    });

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "work",
        channel: "discord",
        to: "channel:123",
        content: "hello",
      }),
    );
  });

  it("uses plugin poll action when available", async () => {
    mocks.dispatchChannelMessageAction.mockResolvedValue({
      ok: true,
      value: { messageId: "poll-plugin" },
      continuePrompt: "",
      output: "",
      sessionId: "s1",
      model: "gpt-5.2",
      usage: {},
    });

    const result = await executePollAction({
      ctx: {
        cfg: {},
        channel: "discord",
        params: {},
        dryRun: false,
      },
      to: "channel:123",
      question: "Lunch?",
      options: ["Pizza", "Sushi"],
      maxSelections: 1,
    });

    expect(result.handledBy).toBe("plugin");
    expect(mocks.sendPoll).not.toHaveBeenCalled();
  });

  it("passes agent-scoped media local roots to plugin dispatch", async () => {
    mocks.dispatchChannelMessageAction.mockResolvedValue({
      ok: true,
      value: { messageId: "msg-plugin" },
      continuePrompt: "",
      output: "",
      sessionId: "s1",
      model: "gpt-5.2",
      usage: {},
    });

    await executeSendAction({
      ctx: {
        cfg: {},
        channel: "discord",
        params: { to: "channel:123", message: "hello" },
        agentId: "agent-1",
        dryRun: false,
      },
      to: "channel:123",
      message: "hello",
    });

    expect(mocks.getAgentScopedMediaLocalRoots).toHaveBeenCalledWith({}, "agent-1");
    expect(mocks.dispatchChannelMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaLocalRoots: ["/tmp/agent-roots"],
      }),
    );
  });

  it("forwards poll args to sendPoll on core outbound path", async () => {
    mocks.dispatchChannelMessageAction.mockResolvedValue(null);
    mocks.sendPoll.mockResolvedValue({
      channel: "discord",
      to: "channel:123",
      question: "Lunch?",
      options: ["Pizza", "Sushi"],
      maxSelections: 1,
      durationSeconds: null,
      durationHours: null,
      via: "gateway",
    });

    await executePollAction({
      ctx: {
        cfg: {},
        channel: "discord",
        params: {},
        accountId: "acc-1",
        dryRun: false,
      },
      to: "channel:123",
      question: "Lunch?",
      options: ["Pizza", "Sushi"],
      maxSelections: 1,
      durationSeconds: 300,
      threadId: "thread-1",
      isAnonymous: true,
    });

    expect(mocks.sendPoll).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "discord",
        accountId: "acc-1",
        to: "channel:123",
        question: "Lunch?",
        options: ["Pizza", "Sushi"],
        maxSelections: 1,
        durationSeconds: 300,
        threadId: "thread-1",
        isAnonymous: true,
      }),
    );
  });
});
