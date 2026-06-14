import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResult } from "../../agents/tools/common.js";
import type { ChannelPlugin } from "../../channels/plugins/types.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import { runMessageAction } from "./message-action-runner.js";

function createAlwaysConfiguredPluginConfig(account: Record<string, unknown> = { enabled: true }) {
  return {
    listAccountIds: () => ["default"],
    resolveAccount: () => account,
    isConfigured: () => true,
  };
}

describe("runMessageAction plugin dispatch", () => {
  describe("media caption behavior", () => {
    afterEach(() => {
      setActivePluginRegistry(createTestRegistry([]));
    });

    it("promotes caption to message for media sends when message is empty", async () => {
      const sendMedia = vi.fn().mockResolvedValue({
        channel: "testchat",
        messageId: "m1",
        chatId: "c1",
      });
      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "testchat",
            source: "test",
            plugin: createOutboundTestPlugin({
              id: "testchat",
              outbound: {
                deliveryMode: "direct",
                sendText: vi.fn().mockResolvedValue({
                  channel: "testchat",
                  messageId: "t1",
                  chatId: "c1",
                }),
                sendMedia,
              },
            },
          },
        } as RemoteClawConfig,
        action: "send",
        params: {
          channel: "policydest",
          target: "oc_123",
          message: "hello",
          media: "/tmp/host.png",
        },
        requesterSenderId: "trusted-user",
        sessionKey: "agent:alpha:requestchat:group:ops",
        dryRun: false,
      });

      const pluginCall = handlePolicyCheckedAction.mock.calls[0]?.[0];
      expect(pluginCall?.mediaAccess).toBeDefined();
      expect(pluginCall?.mediaAccess?.readFile).toBeUndefined();
    });

    it("uses requester username policy for host-media reads", async () => {
      const handlePolicyCheckedAction = vi.fn(async ({ mediaAccess }) =>
        jsonResult({
          ok: true,
          hasHostReadCapability: typeof mediaAccess?.readFile === "function",
        }),
      );
      const policyPlugin: ChannelPlugin = {
        id: "policydest",
        meta: {
          id: "policydest",
          label: "Policy Destination",
          selectionLabel: "Policy Destination",
          docsPath: "/channels/policydest",
          blurb: "Policy destination username test plugin.",
        },
        capabilities: { chatTypes: ["direct", "channel"], media: true },
        config: createAlwaysConfiguredPluginConfig(),
        messaging: {
          targetResolver: {
            looksLikeId: () => true,
          },
        },
        actions: {
          describeMessageTool: () => ({ actions: ["send"] }),
          supportsAction: ({ action }) => action === "send",
          handleAction: handlePolicyCheckedAction,
        },
      };

      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "policydest",
            source: "test",
            plugin: policyPlugin,
          },
        ]),
      );
      const cfg = {
        channels: {
          testchat: {
            enabled: true,
          },
        },
      } as RemoteClawConfig;

      const result = await runMessageAction({
        cfg,
        action: "send",
        params: {
          channel: "testchat",
          target: "channel:abc",
          media: "https://example.com/cat.png",
          caption: "caption-only text",
        },
        dryRun: false,
      });

      expect(result.kind).toBe("send");
      expect(sendMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "caption-only text",
          mediaUrl: "https://example.com/cat.png",
        }),
      );
    });
  });

  describe("card-only send behavior", () => {
    const handleAction = vi.fn(async ({ params }: { params: Record<string, unknown> }) =>
      jsonResult({
        ok: true,
        card: params.card ?? null,
        message: params.message ?? null,
      }),
    );

    const cardPlugin: ChannelPlugin = {
      id: "cardchat",
      meta: {
        id: "cardchat",
        label: "Card Chat",
        selectionLabel: "Card Chat",
        docsPath: "/channels/cardchat",
        blurb: "Card-only send test plugin.",
      },
      capabilities: { chatTypes: ["direct"] },
      config: createAlwaysConfiguredPluginConfig(),
      actions: {
        listActions: () => ["send"],
        supportsAction: ({ action }) => action === "send",
        handleAction,
      },
    };

    beforeEach(() => {
      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "cardchat",
            source: "test",
            plugin: cardPlugin,
          },
        ]),
      );
      handleAction.mockClear();
    });

    afterEach(() => {
      setActivePluginRegistry(createTestRegistry([]));
      vi.clearAllMocks();
    });

    it("allows card-only sends without text or media", async () => {
      const cfg = {
        channels: {
          cardchat: {
            enabled: true,
          },
        },
      } as RemoteClawConfig;

      const card = {
        type: "AdaptiveCard",
        version: "1.4",
        body: [{ type: "TextBlock", text: "Card-only payload" }],
      };

      const result = await runMessageAction({
        cfg,
        action: "send",
        params: {
          channel: "cardchat",
          target: "channel:test-card",
          card,
        },
        dryRun: false,
      });

      expect(result.kind).toBe("send");
      expect(result.handledBy).toBe("plugin");
      expect(handleAction).toHaveBeenCalled();
      expect(result.payload).toMatchObject({
        ok: true,
        card,
      });
    });
  });

  describe("poll plugin forwarding", () => {
    const handleAction = vi.fn(async ({ params }: { params: Record<string, unknown> }) =>
      jsonResult({
        ok: true,
        forwarded: {
          to: params.to ?? null,
          pollQuestion: params.pollQuestion ?? null,
          pollOption: params.pollOption ?? null,
          pollDurationSeconds: params.pollDurationSeconds ?? null,
          pollPublic: params.pollPublic ?? null,
          threadId: params.threadId ?? null,
        },
      }),
    );

    const telegramPollPlugin: ChannelPlugin = {
      id: "telegram",
      meta: {
        id: "telegram",
        label: "Telegram",
        selectionLabel: "Telegram",
        docsPath: "/channels/telegram",
        blurb: "Telegram poll forwarding test plugin.",
      },
      capabilities: { chatTypes: ["direct"] },
      config: createAlwaysConfiguredPluginConfig(),
      messaging: {
        targetResolver: {
          looksLikeId: () => true,
        },
      },
      actions: {
        listActions: () => ["poll"],
        supportsAction: ({ action }) => action === "poll",
        handleAction,
      },
    };

    beforeEach(() => {
      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "pollchat",
            source: "test",
            plugin: pollChatPlugin,
          },
        ]),
      );
      handleAction.mockClear();
    });

    afterEach(() => {
      setActivePluginRegistry(createTestRegistry([]));
      vi.clearAllMocks();
    });

    it("forwards poll params through plugin dispatch", async () => {
      const result = await runMessageAction({
        cfg: {
          channels: {
            pollchat: {
              botToken: "tok",
            },
          },
        } as RemoteClawConfig,
        action: "poll",
        params: {
          channel: "pollchat",
          target: "pollchat:123",
          pollQuestion: "Lunch?",
          pollOption: ["Pizza", "Sushi"],
          pollDurationSeconds: 120,
          pollPublic: true,
          threadId: "42",
        },
        dryRun: false,
      });

      expect(result.kind).toBe("poll");
      expect(result.handledBy).toBe("plugin");
      expect(handleAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "poll",
          channel: "pollchat",
          params: expect.objectContaining({
            to: "pollchat:123",
            pollQuestion: "Lunch?",
            pollOption: ["Pizza", "Sushi"],
            pollDurationSeconds: 120,
            pollPublic: true,
            threadId: "42",
          }),
        }),
      );
      expect(result.payload).toMatchObject({
        ok: true,
        forwarded: {
          to: "pollchat:123",
          pollQuestion: "Lunch?",
          pollOption: ["Pizza", "Sushi"],
          pollDurationSeconds: 120,
          pollPublic: true,
          threadId: "42",
        },
      });
    });
  });

  describe("components parsing", () => {
    const handleAction = vi.fn(async ({ params }: { params: Record<string, unknown> }) =>
      jsonResult({
        ok: true,
        components: params.components ?? null,
      }),
    );

    const componentsPlugin: ChannelPlugin = {
      id: "componentchat",
      meta: {
        id: "componentchat",
        label: "Component Chat",
        selectionLabel: "Component Chat",
        docsPath: "/channels/componentchat",
        blurb: "Component chat send test plugin.",
      },
      capabilities: { chatTypes: ["direct"] },
      config: createAlwaysConfiguredPluginConfig({}),
      actions: {
        listActions: () => ["send"],
        supportsAction: ({ action }) => action === "send",
        handleAction,
      },
    };

    beforeEach(() => {
      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "componentchat",
            source: "test",
            plugin: componentsPlugin,
          },
        ]),
      );
      handleAction.mockClear();
    });

    afterEach(() => {
      setActivePluginRegistry(createTestRegistry([]));
      vi.clearAllMocks();
    });

    it("parses components JSON strings before plugin dispatch", async () => {
      const components = {
        text: "hello",
        buttons: [{ label: "A", customId: "a" }],
      };
      const result = await runMessageAction({
        cfg: {} as RemoteClawConfig,
        action: "send",
        params: {
          channel: "componentchat",
          target: "channel:123",
          message: "hi",
          components: JSON.stringify(components),
        },
        dryRun: false,
      });

      expect(result.kind).toBe("send");
      expect(handleAction).toHaveBeenCalled();
      expect(result.payload).toMatchObject({ ok: true, components });
    });

    it("throws on invalid components JSON strings", async () => {
      await expect(
        runMessageAction({
          cfg: {} as RemoteClawConfig,
          action: "send",
          params: {
            channel: "componentchat",
            target: "channel:123",
            message: "hi",
            components: "{not-json}",
          },
          dryRun: false,
        }),
      ).rejects.toThrow(/--components must be valid JSON/);

      expect(handleAction).not.toHaveBeenCalled();
    });
  });

  describe("accountId defaults", () => {
    const handleAction = vi.fn(async () => jsonResult({ ok: true }));
    const accountPlugin: ChannelPlugin = {
      id: "accountchat",
      meta: {
        id: "accountchat",
        label: "Account Chat",
        selectionLabel: "Account Chat",
        docsPath: "/channels/accountchat",
        blurb: "Account chat test plugin.",
      },
      capabilities: { chatTypes: ["direct"] },
      config: {
        listAccountIds: () => ["default"],
        resolveAccount: () => ({}),
      },
      actions: {
        listActions: () => ["send"],
        handleAction,
      },
    };

    beforeEach(() => {
      setActivePluginRegistry(
        createTestRegistry([
          {
            pluginId: "accountchat",
            source: "test",
            plugin: accountPlugin,
          },
        ]),
      );
      handleAction.mockClear();
    });

    afterEach(() => {
      setActivePluginRegistry(createTestRegistry([]));
      vi.clearAllMocks();
    });

    it.each([
      {
        name: "uses defaultAccountId override",
        args: {
          cfg: {} as RemoteClawConfig,
          defaultAccountId: "ops",
        },
        expectedAccountId: "ops",
      },
      {
        name: "falls back to agent binding account",
        args: {
          cfg: {
            bindings: [
              { agentId: "agent-b", match: { channel: "accountchat", accountId: "account-b" } },
            ],
          } as RemoteClawConfig,
          agentId: "agent-b",
        },
        expectedAccountId: "account-b",
      },
    ])("$name", async ({ args, expectedAccountId }) => {
      await runMessageAction({
        ...args,
        action: "send",
        params: {
          channel: "accountchat",
          target: "channel:123",
          message: "hi",
        },
      });

      expect(handleAction).toHaveBeenCalled();
      const ctx = (handleAction.mock.calls as unknown as Array<[unknown]>)[0]?.[0] as
        | {
            accountId?: string | null;
            params: Record<string, unknown>;
          }
        | undefined;
      if (!ctx) {
        throw new Error("expected action context");
      }
      expect(ctx.accountId).toBe(expectedAccountId);
      expect(ctx.params.accountId).toBe(expectedAccountId);
    });
  });
});
