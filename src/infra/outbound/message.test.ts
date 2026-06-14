import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChannelPlugin: vi.fn(),
  resolveOutboundTarget: vi.fn(),
  deliverOutboundPayloads: vi.fn(),
  loadRemoteClawPlugins: vi.fn(),
}));

vi.mock("../../channels/plugins/index.js", () => ({
  normalizeChannelId: (channel?: string) => channel?.trim().toLowerCase() ?? undefined,
  getChannelPlugin: mocks.getChannelPlugin,
  listChannelPlugins: () => [],
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveSoleAgentId: () => "test-agent",
  listAgentIds: () => ["test-agent"],
  resolveFirstAgentWorkspace: () => "/tmp/remoteclaw-test-workspace",
  resolveAgentWorkspaceDir: () => "/tmp/remoteclaw-test-workspace",
  resolveAgentRuntime: () => "claude",
  resolveDefaultAgentId: () => "test-agent",
}));

vi.mock("../../config/plugin-auto-enable.js", () => ({
  applyPluginAutoEnable: ({ config }: { config: unknown }) => ({ config, changes: [] }),
}));

vi.mock("../../plugins/loader.js", () => ({
  loadRemoteClawPlugins: mocks.loadRemoteClawPlugins,
}));

vi.mock("./targets.js", () => ({
  resolveOutboundTarget: mocks.resolveOutboundTarget,
}));

vi.mock("./deliver.js", () => ({
  deliverOutboundPayloads: mocks.deliverOutboundPayloads,
}));

vi.mock("../../utils/message-channel.js", async () => {
  const actual = await vi.importActual<typeof import("../../utils/message-channel.js")>(
    "../../utils/message-channel.js",
  );
  const deliverable = ["forum", "directchat"];
  return {
    ...actual,
    listDeliverableMessageChannels: () => deliverable,
    isDeliverableMessageChannel: (channel: string) => deliverable.includes(channel),
    isGatewayMessageChannel: (channel: string) =>
      [...deliverable, actual.INTERNAL_MESSAGE_CHANNEL].includes(channel),
    normalizeMessageChannel: (value?: string | null) => value?.trim().toLowerCase() || undefined,
  };
});

import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createTestRegistry } from "../../test-utils/channel-plugins.js";
import { sendMessage } from "./message.js";

describe("sendMessage", () => {
  beforeEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
    mocks.getChannelPlugin.mockClear();
    mocks.resolveOutboundTarget.mockClear();
    mocks.deliverOutboundPayloads.mockClear();
    mocks.loadRemoteClawPlugins.mockClear();

    mocks.getChannelPlugin.mockReturnValue({
      outbound: { deliveryMode: "direct" },
    });
    mocks.resolveOutboundTarget.mockImplementation(({ to }: { to: string }) => ({ ok: true, to }));
    mocks.deliverOutboundPayloads.mockResolvedValue([{ channel: "forum", messageId: "m1" }]);
  });

  it("passes explicit agentId to outbound delivery for scoped media roots", async () => {
    await sendMessage({
      cfg: {},
      channel: "forum",
      to: "123456",
      content: "hi",
      agentId: "work",
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ agentId: "work" }),
        channel: "forum",
        to: "123456",
      }),
    );
  });

  it("recovers telegram plugin resolution so message/send does not fail with Unknown channel: telegram", async () => {
    const telegramPlugin = {
      outbound: { deliveryMode: "direct" },
    };
    mocks.getChannelPlugin
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(forumPlugin)
      .mockReturnValue(forumPlugin);

    await expect(
      sendMessage({
        cfg: { channels: { forum: { token: "test-token" } } },
        channel: "forum",
        to: "123456",
        content: "hi",
      }),
    ).resolves.toMatchObject({
      channel: "forum",
      to: "123456",
      via: "direct",
    });

    expect(mocks.loadRemoteClawPlugins).toHaveBeenCalledTimes(1);
  });
});
