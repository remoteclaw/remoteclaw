import type {
  ButtonInteraction,
  ComponentData,
  ModalInteraction,
  StringSelectMenuInteraction,
} from "@buape/carbon";
import type { Client } from "@buape/carbon";
import { ChannelType } from "discord-api-types/v10";
import type { GatewayPresenceUpdate } from "discord-api-types/v10";
import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import type { DiscordAccountConfig } from "remoteclaw/plugin-sdk/config-runtime";
import { buildPluginBindingApprovalCustomId } from "remoteclaw/plugin-sdk/conversation-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { peekSystemEvents, resetSystemEventsForTest } from "../../../../src/infra/system-events.ts";
import {
  clearDiscordComponentEntries,
  registerDiscordComponentEntries,
  resolveDiscordComponentEntry,
  resolveDiscordModalEntry,
} from "../components-registry.js";
import type { DiscordComponentEntry, DiscordModalEntry } from "../components.js";
import {
  createDiscordComponentButton,
  createDiscordComponentModal,
} from "./agent-components.js";
import type { DiscordChannelConfigResolved } from "./allow-list.js";
import {
  resolveDiscordMemberAllowed,
  resolveDiscordOwnerAllowFrom,
  resolveDiscordRoleAllowed,
} from "./allow-list.js";
import {
  clearGateways,
  getGateway,
  registerGateway,
  unregisterGateway,
} from "./gateway-registry.js";
import { clearPresences, getPresence, presenceCacheSize, setPresence } from "./presence-cache.js";
import { resolveDiscordPresenceUpdate } from "./presence.js";
import {
  maybeCreateDiscordAutoThread,
  resolveDiscordAutoThreadContext,
  resolveDiscordAutoThreadReplyPlan,
  resolveDiscordReplyDeliveryPlan,
} from "./threading.js";

const readAllowFromStoreMock = vi.hoisted(() => vi.fn());
const upsertPairingRequestMock = vi.hoisted(() => vi.fn());
const enqueueSystemEventMock = vi.hoisted(() => vi.fn());
const dispatchReplyMock = vi.hoisted(() => vi.fn());
const deliverDiscordReplyMock = vi.hoisted(() => vi.fn());
const recordInboundSessionMock = vi.hoisted(() => vi.fn());
const readSessionUpdatedAtMock = vi.hoisted(() => vi.fn());
const resolveStorePathMock = vi.hoisted(() => vi.fn());
const dispatchPluginInteractiveHandlerMock = vi.hoisted(() => vi.fn());
const resolvePluginConversationBindingApprovalMock = vi.hoisted(() => vi.fn());
const buildPluginBindingResolvedTextMock = vi.hoisted(() => vi.fn());
let lastDispatchCtx: Record<string, unknown> | undefined;

vi.mock("../../../../src/pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: (...args: unknown[]) => readAllowFromStoreMock(...args),
  upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
}));

vi.mock("remoteclaw/plugin-sdk/conversation-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("remoteclaw/plugin-sdk/conversation-runtime")>();
  return {
    ...actual,
    upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
    resolvePluginConversationBindingApproval: (...args: unknown[]) =>
      resolvePluginConversationBindingApprovalMock(...args),
    buildPluginBindingResolvedText: (...args: unknown[]) =>
      buildPluginBindingResolvedTextMock(...args),
    recordInboundSession: (...args: unknown[]) => recordInboundSessionMock(...args),
  };
});
vi.mock("openclaw/plugin-sdk/conversation-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/conversation-runtime")>();
  return {
    ...actual,
    upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
    resolvePluginConversationBindingApproval: (...args: unknown[]) =>
      resolvePluginConversationBindingApprovalMock(...args),
    buildPluginBindingResolvedText: (...args: unknown[]) =>
      buildPluginBindingResolvedTextMock(...args),
    recordInboundSession: (...args: unknown[]) => recordInboundSessionMock(...args),
  };
});

vi.mock("openclaw/plugin-sdk/infra-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/infra-runtime")>();
  return {
    ...actual,
    enqueueSystemEvent: (...args: unknown[]) => enqueueSystemEventMock(...args),
  };
});
vi.mock("openclaw/plugin-sdk/infra-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/infra-runtime")>();
  return {
    ...actual,
    enqueueSystemEvent: (...args: unknown[]) => enqueueSystemEventMock(...args),
  };
});

vi.mock("remoteclaw/plugin-sdk/reply-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("remoteclaw/plugin-sdk/reply-runtime")>();
  return {
    ...actual,
    dispatchReplyWithBufferedBlockDispatcher: (...args: unknown[]) => dispatchReplyMock(...args),
  };
});

vi.mock("./reply-delivery.js", () => ({
  deliverDiscordReply: (...args: unknown[]) => deliverDiscordReplyMock(...args),
}));

vi.mock("openclaw/plugin-sdk/config-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/config-runtime")>();
  return {
    ...actual,
    readSessionUpdatedAt: (...args: unknown[]) => readSessionUpdatedAtMock(...args),
    resolveStorePath: (...args: unknown[]) => resolveStorePathMock(...args),
  };
});

vi.mock("../../../../src/plugins/conversation-binding.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/plugins/conversation-binding.js")>();
  return {
    ...actual,
    resolvePluginConversationBindingApproval: (...args: unknown[]) =>
      resolvePluginConversationBindingApprovalMock(...args),
    buildPluginBindingResolvedText: (...args: unknown[]) =>
      buildPluginBindingResolvedTextMock(...args),
  };
});

vi.mock("../../../../src/plugins/interactive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/plugins/interactive.js")>();
  return {
    ...actual,
    dispatchPluginInteractiveHandler: (...args: unknown[]) =>
      dispatchPluginInteractiveHandlerMock(...args),
  };
});

describe("agent components", () => {
  const defaultDmSessionKey = buildAgentSessionKey({
    agentId: "main",
    channel: "discord",
    accountId: "default",
    peer: { kind: "direct", id: "123456789" },
  });

  const createCfg = (): OpenClawConfig => ({}) as OpenClawConfig;

  const createBaseDmInteraction = (overrides: Record<string, unknown> = {}) => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const defer = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      rawData: { channel_id: "dm-channel" },
      user: { id: "123456789", username: "Alice", discriminator: "1234" },
      defer,
      reply,
      ...overrides,
    };
    return { interaction, defer, reply };
  };

  const createDmButtonInteraction = (overrides: Partial<ButtonInteraction> = {}) => {
    const { interaction, defer, reply } = createBaseDmInteraction(
      overrides as Record<string, unknown>,
    );
    return {
      interaction: interaction as unknown as ButtonInteraction,
      defer,
      reply,
    };
  };

  const createDmSelectInteraction = (overrides: Partial<StringSelectMenuInteraction> = {}) => {
    const { interaction, defer, reply } = createBaseDmInteraction({
      values: ["alpha"],
      ...(overrides as Record<string, unknown>),
    });
    return {
      interaction: interaction as unknown as StringSelectMenuInteraction,
      defer,
      reply,
    };
  };

  beforeEach(() => {
    readAllowFromStoreMock.mockClear().mockResolvedValue([]);
    upsertPairingRequestMock.mockClear().mockResolvedValue({ code: "PAIRCODE", created: true });
    resetSystemEventsForTest();
  });

  it("sends pairing reply when DM sender is not allowlisted", async () => {
    const button = createAgentComponentButton({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "pairing",
    });
    const { interaction, defer, reply } = createDmButtonInteraction();

    await button.run(interaction, { componentId: "hello" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
    const pairingText = String(reply.mock.calls[0]?.[0]?.content ?? "");
    expect(pairingText).toContain("Pairing code:");
    const code = pairingText.match(/Pairing code:\s*([A-Z2-9]{8})/)?.[1];
    expect(code).toBeDefined();
    expect(pairingText).toContain(`openclaw pairing approve discord ${code}`);
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([]);
    expect(readAllowFromStoreMock).toHaveBeenCalledWith("discord", "default");
  });

  it("blocks DM interactions in allowlist mode when sender is not in configured allowFrom", async () => {
    const button = createAgentComponentButton({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "allowlist",
    });
    const { interaction, defer, reply } = createDmButtonInteraction();

    await button.run(interaction, { componentId: "hello" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "You are not authorized to use this button.",
      ephemeral: true,
    });
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([]);
    expect(readAllowFromStoreMock).not.toHaveBeenCalled();
  });

  it("authorizes DM interactions from pairing-store entries in pairing mode", async () => {
    readAllowFromStoreMock.mockResolvedValue(["123456789"]);
    const button = createAgentComponentButton({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "pairing",
    });
    const { interaction, defer, reply } = createDmButtonInteraction();

    await button.run(interaction, { componentId: "hello" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({ content: "✓", ephemeral: true });
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([
      "[Discord component: hello clicked by Alice#1234 (123456789)]",
    ]);
    expect(upsertPairingRequestMock).not.toHaveBeenCalled();
    expect(readAllowFromStoreMock).toHaveBeenCalledWith("discord", "default");
  });

  it("allows DM component interactions in open mode without reading pairing store", async () => {
    readAllowFromStoreMock.mockResolvedValue(["123456789"]);
    const button = createAgentComponentButton({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "open",
    });
    const { interaction, defer, reply } = createDmButtonInteraction();

    await button.run(interaction, { componentId: "hello" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({ content: "✓", ephemeral: true });
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([
      "[Discord component: hello clicked by Alice#1234 (123456789)]",
    ]);
    expect(readAllowFromStoreMock).not.toHaveBeenCalled();
  });

  it("blocks DM component interactions in disabled mode without reading pairing store", async () => {
    readAllowFromStoreMock.mockResolvedValue(["123456789"]);
    const button = createAgentComponentButton({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "disabled",
    });
    const { interaction, defer, reply } = createDmButtonInteraction();

    await button.run(interaction, { componentId: "hello" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: "DM interactions are disabled.",
      ephemeral: true,
    });
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([]);
    expect(readAllowFromStoreMock).not.toHaveBeenCalled();
  });

  it("matches tag-based allowlist entries for DM select menus", async () => {
    const select = createAgentSelectMenu({
      cfg: createCfg(),
      accountId: "default",
      discordConfig: { dangerouslyAllowNameMatching: true } as DiscordAccountConfig,
      dmPolicy: "allowlist",
      allowFrom: ["Alice#1234"],
    });
    const { interaction, defer, reply } = createDmSelectInteraction();

    await select.run(interaction, { componentId: "hello" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({ content: "✓", ephemeral: true });
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([
      "[Discord select menu: hello interacted by Alice#1234 (123456789) (selected: alpha)]",
    ]);
    expect(readAllowFromStoreMock).not.toHaveBeenCalled();
  });

  it("accepts cid payloads for agent button interactions", async () => {
    const button = createAgentComponentButton({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "allowlist",
      allowFrom: ["123456789"],
    });
    const { interaction, defer, reply } = createDmButtonInteraction();

    await button.run(interaction, { cid: "hello_cid" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({ content: "✓", ephemeral: true });
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([
      "[Discord component: hello_cid clicked by Alice#1234 (123456789)]",
    ]);
    expect(readAllowFromStoreMock).not.toHaveBeenCalled();
  });

  it("keeps malformed percent cid values without throwing", async () => {
    const button = createAgentComponentButton({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "allowlist",
      allowFrom: ["123456789"],
    });
    const { interaction, defer, reply } = createDmButtonInteraction();

    await button.run(interaction, { cid: "hello%2G" } as ComponentData);

    expect(defer).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({ content: "✓", ephemeral: true });
    expect(peekSystemEvents(defaultDmSessionKey)).toEqual([
      "[Discord component: hello%2G clicked by Alice#1234 (123456789)]",
    ]);
    expect(readAllowFromStoreMock).not.toHaveBeenCalled();
  });
});

describe("discord component interactions", () => {
  const createCfg = (): RemoteClawConfig =>
    ({
      channels: {
        discord: {
          replyToMode: "first",
        },
      },
    }) as RemoteClawConfig;

  const createDiscordConfig = (overrides?: Partial<DiscordAccountConfig>): DiscordAccountConfig =>
    ({
      replyToMode: "first",
      ...overrides,
    }) as DiscordAccountConfig;

  type DispatchParams = {
    ctx: Record<string, unknown>;
    dispatcherOptions: {
      deliver: (payload: { text?: string }) => Promise<void> | void;
    };
  };

  const createComponentContext = (
    overrides?: Partial<Parameters<typeof createDiscordComponentButton>[0]>,
  ) =>
    ({
      cfg: createCfg(),
      accountId: "default",
      dmPolicy: "allowlist",
      allowFrom: ["123456789"],
      discordConfig: createDiscordConfig(),
      token: "token",
      ...overrides,
    }) as Parameters<typeof createDiscordComponentButton>[0];

  const createComponentButtonInteraction = (overrides: Partial<ButtonInteraction> = {}) => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const defer = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      rawData: { channel_id: "dm-channel", id: "interaction-1" },
      user: { id: "123456789", username: "AgentUser", discriminator: "0001" },
      customId: "occomp:cid=btn_1",
      message: { id: "msg-1" },
      client: { rest: {} },
      defer,
      reply,
      ...overrides,
    } as unknown as ButtonInteraction;
    return { interaction, defer, reply };
  };

  const createModalInteraction = (overrides: Partial<ModalInteraction> = {}) => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    const fields = {
      getText: (key: string) => (key === "fld_1" ? "Casey" : undefined),
      getStringSelect: (_key: string) => undefined,
      getRoleSelect: (_key: string) => [],
      getUserSelect: (_key: string) => [],
    };
    const interaction = {
      rawData: { channel_id: "dm-channel", id: "interaction-2" },
      user: { id: "123456789", username: "AgentUser", discriminator: "0001" },
      customId: "ocmodal:mid=mdl_1",
      fields,
      acknowledge,
      reply,
      client: { rest: {} },
      ...overrides,
    } as unknown as ModalInteraction;
    return { interaction, acknowledge, reply };
  };

  const createButtonEntry = (
    overrides: Partial<DiscordComponentEntry> = {},
  ): DiscordComponentEntry => ({
    id: "btn_1",
    kind: "button",
    label: "Approve",
    messageId: "msg-1",
    sessionKey: "session-1",
    agentId: "agent-1",
    accountId: "default",
    ...overrides,
  });

  const createModalEntry = (overrides: Partial<DiscordModalEntry> = {}): DiscordModalEntry => ({
    id: "mdl_1",
    title: "Details",
    messageId: "msg-2",
    sessionKey: "session-2",
    agentId: "agent-2",
    accountId: "default",
    fields: [
      {
        id: "fld_1",
        name: "name",
        label: "Name",
        type: "text",
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    clearDiscordComponentEntries();
    lastDispatchCtx = undefined;
    readAllowFromStoreMock.mockClear().mockResolvedValue([]);
    upsertPairingRequestMock.mockClear().mockResolvedValue({ code: "PAIRCODE", created: true });
    enqueueSystemEventMock.mockClear();
    dispatchReplyMock.mockClear().mockImplementation(async (params: DispatchParams) => {
      lastDispatchCtx = params.ctx;
      await params.dispatcherOptions.deliver({ text: "ok" });
    });
    deliverDiscordReplyMock.mockClear();
    recordInboundSessionMock.mockClear().mockResolvedValue(undefined);
    readSessionUpdatedAtMock.mockClear().mockReturnValue(undefined);
    resolveStorePathMock.mockClear().mockReturnValue("/tmp/openclaw-sessions-test.json");
    dispatchPluginInteractiveHandlerMock.mockReset().mockResolvedValue({
      matched: false,
      handled: false,
      duplicate: false,
    });
    resolvePluginConversationBindingApprovalMock.mockReset().mockResolvedValue({
      status: "approved",
      binding: {
        bindingId: "binding-1",
        pluginId: "openclaw-codex-app-server",
        pluginName: "OpenClaw App Server",
        pluginRoot: "/plugins/codex",
        channel: "discord",
        accountId: "default",
        conversationId: "user:123456789",
        boundAt: Date.now(),
      },
      request: {
        id: "approval-1",
        pluginId: "openclaw-codex-app-server",
        pluginName: "OpenClaw App Server",
        pluginRoot: "/plugins/codex",
        requestedAt: Date.now(),
        conversation: {
          channel: "discord",
          accountId: "default",
          conversationId: "user:123456789",
        },
      },
      decision: "allow-once",
    });
    buildPluginBindingResolvedTextMock.mockReset().mockReturnValue("Binding approved.");
  });

  it("routes button clicks with reply references", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry()],
      modals: [],
    });

    const button = createDiscordComponentButton(createComponentContext());
    const { interaction, reply } = createComponentButtonInteraction();

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(reply).toHaveBeenCalledWith({ content: "✓" });
    expect(lastDispatchCtx?.BodyForAgent).toBe('Clicked "Approve".');
    expect(dispatchReplyMock).toHaveBeenCalledTimes(1);
    expect(deliverDiscordReplyMock).toHaveBeenCalledTimes(1);
    expect(deliverDiscordReplyMock.mock.calls[0]?.[0]?.replyToId).toBe("msg-1");
    expect(resolveDiscordComponentEntry({ id: "btn_1" })).toBeNull();
  });

  it("keeps reusable buttons active after use", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry({ reusable: true })],
      modals: [],
    });

    const button = createDiscordComponentButton(createComponentContext());
    const { interaction } = createComponentButtonInteraction();
    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    const { interaction: secondInteraction } = createComponentButtonInteraction({
      rawData: {
        channel_id: "dm-channel",
        id: "interaction-2",
      } as unknown as ButtonInteraction["rawData"],
    });
    await button.run(secondInteraction, { cid: "btn_1" } as ComponentData);

    expect(dispatchReplyMock).toHaveBeenCalledTimes(2);
    expect(resolveDiscordComponentEntry({ id: "btn_1", consume: false })).not.toBeNull();
  });

  it("blocks buttons when allowedUsers does not match", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry({ allowedUsers: ["999"] })],
      modals: [],
    });

    const button = createDiscordComponentButton(createComponentContext());
    const { interaction, reply } = createComponentButtonInteraction();

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(reply).toHaveBeenCalledWith({ content: "You are not authorized to use this button." });
    expect(dispatchReplyMock).not.toHaveBeenCalled();
    expect(resolveDiscordComponentEntry({ id: "btn_1", consume: false })).not.toBeNull();
  });

  async function runModalSubmission(params?: { reusable?: boolean }) {
    registerDiscordComponentEntries({
      entries: [],
      modals: [createModalEntry({ reusable: params?.reusable ?? false })],
    });

    const modal = createDiscordComponentModal(
      createComponentContext({
        discordConfig: createDiscordConfig({ replyToMode: "all" }),
      }),
    );
    const { interaction, acknowledge } = createModalInteraction();

    await modal.run(interaction, { mid: "mdl_1" } as ComponentData);
    return { acknowledge };
  }

  it("routes modal submissions with field values", async () => {
    const { acknowledge } = await runModalSubmission();

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(lastDispatchCtx?.BodyForAgent).toContain('Form "Details" submitted.');
    expect(lastDispatchCtx?.BodyForAgent).toContain("- Name: Casey");
    expect(dispatchReplyMock).toHaveBeenCalledTimes(1);
    expect(deliverDiscordReplyMock).toHaveBeenCalledTimes(1);
    expect(deliverDiscordReplyMock.mock.calls[0]?.[0]?.replyToId).toBe("msg-2");
    expect(resolveDiscordModalEntry({ id: "mdl_1" })).toBeNull();
  });

  it("does not mark guild modal events as command-authorized for non-allowlisted users", async () => {
    registerDiscordComponentEntries({
      entries: [],
      modals: [createModalEntry()],
    });

    const modal = createDiscordComponentModal(
      createComponentContext({
        cfg: {
          commands: { useAccessGroups: true },
          channels: { discord: { replyToMode: "first" } },
        } as RemoteClawConfig,
        allowFrom: ["owner-1"],
      }),
    );
    const { interaction, acknowledge } = createModalInteraction({
      rawData: {
        channel_id: "guild-channel",
        guild_id: "guild-1",
        id: "interaction-guild-1",
        member: { roles: [] },
      } as unknown as ModalInteraction["rawData"],
      guild: { id: "guild-1", name: "Test Guild" } as unknown as ModalInteraction["guild"],
    });

    await modal.run(interaction, { mid: "mdl_1" } as ComponentData);

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(dispatchReplyMock).toHaveBeenCalledTimes(1);
    expect(lastDispatchCtx?.CommandAuthorized).toBe(false);
  });

  it("marks guild modal events as command-authorized for allowlisted users", async () => {
    registerDiscordComponentEntries({
      entries: [],
      modals: [createModalEntry()],
    });

    const modal = createDiscordComponentModal(
      createComponentContext({
        cfg: {
          commands: { useAccessGroups: true },
          channels: { discord: { replyToMode: "first" } },
        } as RemoteClawConfig,
        allowFrom: ["123456789"],
      }),
    );
    const { interaction, acknowledge } = createModalInteraction({
      rawData: {
        channel_id: "guild-channel",
        guild_id: "guild-1",
        id: "interaction-guild-2",
        member: { roles: [] },
      } as unknown as ModalInteraction["rawData"],
      guild: { id: "guild-1", name: "Test Guild" } as unknown as ModalInteraction["guild"],
    });

    await modal.run(interaction, { mid: "mdl_1" } as ComponentData);

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(dispatchReplyMock).toHaveBeenCalledTimes(1);
    expect(lastDispatchCtx?.CommandAuthorized).toBe(true);
  });

  it("keeps reusable modal entries active after submission", async () => {
    const { acknowledge } = await runModalSubmission({ reusable: true });

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(resolveDiscordModalEntry({ id: "mdl_1", consume: false })).not.toBeNull();
  });

  it("passes false auth to plugin Discord interactions for non-allowlisted guild users", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry({ callbackData: "codex:approve" })],
      modals: [],
    });
    dispatchPluginInteractiveHandlerMock.mockResolvedValue({
      matched: true,
      handled: true,
      duplicate: false,
    });

    const button = createDiscordComponentButton(
      createComponentContext({
        cfg: {
          commands: { useAccessGroups: true },
          channels: { discord: { replyToMode: "first" } },
        } as RemoteClawConfig,
        allowFrom: ["owner-1"],
      }),
    );
    const { interaction } = createComponentButtonInteraction({
      rawData: {
        channel_id: "guild-channel",
        guild_id: "guild-1",
        id: "interaction-guild-plugin-1",
        member: { roles: [] },
      } as unknown as ButtonInteraction["rawData"],
      guild: { id: "guild-1", name: "Test Guild" } as unknown as ButtonInteraction["guild"],
    });

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(dispatchPluginInteractiveHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          auth: { isAuthorizedSender: false },
        }),
      }),
    );
    expect(dispatchReplyMock).not.toHaveBeenCalled();
  });

  it("passes true auth to plugin Discord interactions for allowlisted guild users", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry({ callbackData: "codex:approve" })],
      modals: [],
    });
    dispatchPluginInteractiveHandlerMock.mockResolvedValue({
      matched: true,
      handled: true,
      duplicate: false,
    });

    const button = createDiscordComponentButton(
      createComponentContext({
        cfg: {
          commands: { useAccessGroups: true },
          channels: { discord: { replyToMode: "first" } },
        } as RemoteClawConfig,
        allowFrom: ["123456789"],
      }),
    );
    const { interaction } = createComponentButtonInteraction({
      rawData: {
        channel_id: "guild-channel",
        guild_id: "guild-1",
        id: "interaction-guild-plugin-2",
        member: { roles: [] },
      } as unknown as ButtonInteraction["rawData"],
      guild: { id: "guild-1", name: "Test Guild" } as unknown as ButtonInteraction["guild"],
    });

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(dispatchPluginInteractiveHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          auth: { isAuthorizedSender: true },
        }),
      }),
    );
    expect(dispatchReplyMock).not.toHaveBeenCalled();
  });

  it("routes plugin Discord interactions in group DMs by channel id instead of sender id", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry({ callbackData: "codex:approve" })],
      modals: [],
    });
    dispatchPluginInteractiveHandlerMock.mockResolvedValue({
      matched: true,
      handled: true,
      duplicate: false,
    });

    const button = createDiscordComponentButton(createComponentContext());
    const { interaction } = createComponentButtonInteraction({
      rawData: {
        channel_id: "group-dm-1",
        id: "interaction-group-dm-1",
      } as unknown as ButtonInteraction["rawData"],
      channel: {
        id: "group-dm-1",
        type: ChannelType.GroupDM,
      } as unknown as ButtonInteraction["channel"],
    });

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(dispatchPluginInteractiveHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          conversationId: "channel:group-dm-1",
          senderId: "123456789",
        }),
      }),
    );
    expect(dispatchReplyMock).not.toHaveBeenCalled();
  });

  it("does not fall through to Claw when a plugin Discord interaction already replied", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry({ callbackData: "codex:approve" })],
      modals: [],
    });
    dispatchPluginInteractiveHandlerMock.mockImplementation(async (params: any) => {
      await params.respond.reply({ text: "✓", ephemeral: true });
      return {
        matched: true,
        handled: true,
        duplicate: false,
      };
    });

    const button = createDiscordComponentButton(createComponentContext());
    const { interaction, reply } = createComponentButtonInteraction();

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(dispatchPluginInteractiveHandlerMock).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith({ content: "✓", ephemeral: true });
    expect(dispatchReplyMock).not.toHaveBeenCalled();
  });

  it("falls through to built-in Discord component routing when a plugin declines handling", async () => {
    registerDiscordComponentEntries({
      entries: [createButtonEntry({ callbackData: "codex:approve" })],
      modals: [],
    });
    dispatchPluginInteractiveHandlerMock.mockResolvedValue({
      matched: true,
      handled: false,
      duplicate: false,
    });

    const button = createDiscordComponentButton(createComponentContext());
    const { interaction, reply } = createComponentButtonInteraction();

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(dispatchPluginInteractiveHandlerMock).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith({ content: "✓" });
    expect(dispatchReplyMock).toHaveBeenCalledTimes(1);
  });

  it("resolves plugin binding approvals without falling through to Claw", async () => {
    registerDiscordComponentEntries({
      entries: [
        createButtonEntry({
          callbackData: buildPluginBindingApprovalCustomId("approval-1", "allow-once"),
        }),
      ],
      modals: [],
    });
    const button = createDiscordComponentButton(createComponentContext());
    const update = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      ...(createComponentButtonInteraction().interaction as any),
      update,
      followUp,
    } as ButtonInteraction;

    await button.run(interaction, { cid: "btn_1" } as ComponentData);

    expect(resolvePluginConversationBindingApprovalMock).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ components: [] });
    expect(followUp).toHaveBeenCalledWith({
      content: "Binding approved.",
      ephemeral: true,
    });
    expect(dispatchReplyMock).not.toHaveBeenCalled();
  });
});
