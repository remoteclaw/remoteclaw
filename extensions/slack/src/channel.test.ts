import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/slack";
import { describe, expect, it, vi } from "vitest";

const handleSlackActionMock = vi.fn();

vi.mock("./runtime.js", () => ({
  getSlackRuntime: () => ({
    channel: {
      slack: {
        handleSlackAction: handleSlackActionMock,
      },
    },
  }),
}));

import { slackPlugin } from "./channel.js";

async function getSlackConfiguredState(cfg: OpenClawConfig) {
  const account = slackPlugin.config.resolveAccount(cfg, "default");
  return {
    configured: slackPlugin.config.isConfigured?.(account, cfg),
    snapshot: await slackPlugin.status?.buildAccountSnapshot?.({
      account,
      cfg,
      runtime: undefined,
    }),
  };
}

describe("slackPlugin actions", () => {
  it("prefers session lookup for announce target routing", () => {
    expect(slackPlugin.meta.preferSessionLookupForAnnounceTarget).toBe(true);
  });

  it("owns unified message tool discovery", () => {
    const discovery = slackPlugin.actions?.describeMessageTool({
      cfg: {
        channels: {
          slack: {
            botToken: "xoxb-test",
            appToken: "xapp-test",
            capabilities: { interactiveReplies: true },
          },
        },
      },
    });

    expect(discovery?.actions).toContain("send");
    expect(discovery?.capabilities).toEqual(expect.arrayContaining(["blocks", "interactive"]));
    expect(discovery?.schema).toMatchObject({
      properties: {
        blocks: expect.any(Object),
      },
    });
  });

  it("forwards read threadId to Slack action handler", async () => {
    handleSlackActionMock.mockResolvedValueOnce({ messages: [], hasMore: false });
    const handleAction = slackPlugin.actions?.handleAction;
    expect(handleAction).toBeDefined();

    await handleAction!({
      action: "read",
      channel: "slack",
      accountId: "default",
      cfg: {},
      params: {
        channelId: "C123",
        threadId: "1712345678.123456",
      },
    });

    expect(handleSlackActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "readMessages",
        channelId: "C123",
        threadId: "1712345678.123456",
      }),
      {},
      undefined,
    );
  });
});

describe("slackPlugin outbound", () => {
  const cfg = {
    channels: {
      slack: {
        botToken: "xoxb-test",
        appToken: "xapp-test",
      },
    },
  };

  it("uses threadId as threadTs fallback for sendText", async () => {
    const sendSlack = vi.fn().mockResolvedValue({ messageId: "m-text" });
    const sendText = slackPlugin.outbound?.sendText;
    expect(sendText).toBeDefined();

    const result = await sendText!({
      cfg,
      to: "C123",
      text: "hello",
      accountId: "default",
      threadId: "1712345678.123456",
      deps: { sendSlack },
    });

    expect(sendSlack).toHaveBeenCalledWith(
      "C123",
      "hello",
      expect.objectContaining({
        threadTs: "1712345678.123456",
      }),
    );
    expect(result).toEqual({ channel: "slack", messageId: "m-text" });
  });

  it("prefers replyToId over threadId for sendMedia", async () => {
    const sendSlack = vi.fn().mockResolvedValue({ messageId: "m-media" });
    const sendMedia = slackPlugin.outbound?.sendMedia;
    expect(sendMedia).toBeDefined();

    const result = await sendMedia!({
      cfg,
      to: "C999",
      text: "caption",
      mediaUrl: "https://example.com/image.png",
      accountId: "default",
      replyToId: "1712000000.000001",
      threadId: "1712345678.123456",
      deps: { sendSlack },
    });

    expect(sendSlack).toHaveBeenCalledWith(
      "C999",
      "caption",
      expect.objectContaining({
        mediaUrl: "https://example.com/image.png",
        threadTs: "1712000000.000001",
      }),
    );
    expect(result).toEqual({ channel: "slack", messageId: "m-media" });
  });

  it("forwards mediaLocalRoots for sendMedia", async () => {
    const sendSlack = vi.fn().mockResolvedValue({ messageId: "m-media-local" });
    const sendMedia = slackPlugin.outbound?.sendMedia;
    expect(sendMedia).toBeDefined();
    const mediaLocalRoots = ["/tmp/workspace"];

    const result = await sendMedia!({
      cfg,
      to: "C999",
      text: "caption",
      mediaUrl: "/tmp/workspace/image.png",
      mediaLocalRoots,
      accountId: "default",
      deps: { sendSlack },
    });

    expect(sendSlack).toHaveBeenCalledWith(
      "C999",
      "caption",
      expect.objectContaining({
        mediaUrl: "/tmp/workspace/image.png",
        mediaLocalRoots,
      }),
    );
    expect(result).toEqual({ channel: "slack", messageId: "m-media-local" });
  });
});

describe("slackPlugin outbound new targets", () => {
  const cfg = {
    channels: {
      slack: {
        botToken: "xoxb-test",
        appToken: "xapp-test",
      },
    },
  };

  it("sends to a new user target via DM without erroring", async () => {
    const sendSlack = vi.fn().mockResolvedValue({ messageId: "m-new-user", channelId: "D999" });
    const sendText = slackPlugin.outbound?.sendText;
    expect(sendText).toBeDefined();

    const result = await sendText!({
      cfg,
      to: "user:U99NEW",
      text: "hello new user",
      accountId: "default",
      deps: { sendSlack },
    });

    expect(sendSlack).toHaveBeenCalledWith(
      "user:U99NEW",
      "hello new user",
      expect.objectContaining({ cfg }),
    );
    expect(result).toEqual({ channel: "slack", messageId: "m-new-user", channelId: "D999" });
  });

  it("sends to a new channel target without erroring", async () => {
    const sendSlack = vi.fn().mockResolvedValue({ messageId: "m-new-chan", channelId: "C555" });
    const sendText = slackPlugin.outbound?.sendText;
    expect(sendText).toBeDefined();

    const result = await sendText!({
      cfg,
      to: "channel:C555NEW",
      text: "hello channel",
      accountId: "default",
      deps: { sendSlack },
    });

    expect(sendSlack).toHaveBeenCalledWith(
      "channel:C555NEW",
      "hello channel",
      expect.objectContaining({ cfg }),
    );
    expect(result).toEqual({ channel: "slack", messageId: "m-new-chan", channelId: "C555" });
  });

  it("sends media to a new user target without erroring", async () => {
    const sendSlack = vi.fn().mockResolvedValue({ messageId: "m-new-media", channelId: "D888" });
    const sendMedia = slackPlugin.outbound?.sendMedia;
    expect(sendMedia).toBeDefined();

    const result = await sendMedia!({
      cfg,
      to: "user:U88NEW",
      text: "here is a file",
      mediaUrl: "https://example.com/file.png",
      accountId: "default",
      deps: { sendSlack },
    });

    expect(sendSlack).toHaveBeenCalledWith(
      "user:U88NEW",
      "here is a file",
      expect.objectContaining({
        cfg,
        mediaUrl: "https://example.com/file.png",
      }),
    );
    expect(result).toEqual({ channel: "slack", messageId: "m-new-media", channelId: "D888" });
  });
});

describe("slackPlugin config", () => {
  it("treats HTTP mode accounts with bot token + signing secret as configured", async () => {
    const cfg: RemoteClawConfig = {
      channels: {
        slack: {
          mode: "http",
          botToken: "xoxb-http",
          signingSecret: "secret-http", // pragma: allowlist secret
        },
      },
    };

    const { configured, snapshot } = await getSlackConfiguredState(cfg);

    expect(configured).toBe(true);
    expect(snapshot?.configured).toBe(true);
  });

  it("keeps socket mode requiring app token", async () => {
    const cfg: RemoteClawConfig = {
      channels: {
        slack: {
          mode: "socket",
          botToken: "xoxb-socket",
        },
      },
    };

    const { configured, snapshot } = await getSlackConfiguredState(cfg);

    expect(configured).toBe(false);
    expect(snapshot?.configured).toBe(false);
  });
});
