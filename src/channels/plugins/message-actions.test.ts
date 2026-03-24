import { afterEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import {
  supportsChannelMessageButtons,
  supportsChannelMessageButtonsForChannel,
  supportsChannelMessageCards,
  supportsChannelMessageCardsForChannel,
} from "./message-actions.js";
import type { ChannelPlugin } from "./types.js";

const emptyRegistry = createTestRegistry([]);

function createMessageActionsPlugin(params: {
  id: "discord" | "telegram";
  supportsButtons: boolean;
  supportsCards: boolean;
}): ChannelPlugin {
  return {
    ...createChannelTestPluginBase({
      id: params.id,
      label: params.id === "discord" ? "Discord" : "Telegram",
      capabilities: { chatTypes: ["direct", "group"] },
      config: {
        listAccountIds: () => ["default"],
      },
    }),
    actions: {
      describeMessageTool: () => ({
        actions: ["send"],
        capabilities: params.capabilities,
      }),
    },
  };
}

const buttonsPlugin = createMessageActionsPlugin({
  id: "discord",
  supportsButtons: true,
  supportsCards: false,
});

const cardsPlugin = createMessageActionsPlugin({
  id: "telegram",
  supportsButtons: false,
  supportsCards: true,
});

function activateMessageActionTestRegistry() {
  setActivePluginRegistry(
    createTestRegistry([
      { pluginId: "discord", source: "test", plugin: buttonsPlugin },
      { pluginId: "telegram", source: "test", plugin: cardsPlugin },
    ]),
  );
}

describe("message action capability checks", () => {
  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("aggregates buttons/card support across plugins", () => {
    activateMessageActionTestRegistry();

    expect(supportsChannelMessageButtons({} as RemoteClawConfig)).toBe(true);
    expect(supportsChannelMessageCards({} as RemoteClawConfig)).toBe(true);
  });

  it("checks per-channel capabilities", () => {
    activateMessageActionTestRegistry();

    expect(
      supportsChannelMessageButtonsForChannel({ cfg: {} as RemoteClawConfig, channel: "discord" }),
    ).toBe(true);
    expect(
      supportsChannelMessageButtonsForChannel({ cfg: {} as RemoteClawConfig, channel: "telegram" }),
    ).toBe(false);
    expect(
      supportsChannelMessageCardsForChannel({ cfg: {} as RemoteClawConfig, channel: "telegram" }),
    ).toBe(true);
    expect(
      channelSupportsMessageCapabilityForChannel(
        { cfg: {} as RemoteClawConfig, channel: "telegram" },
        "buttons",
      ),
    ).toBe(false);
    expect(
      channelSupportsMessageCapabilityForChannel(
        { cfg: {} as RemoteClawConfig, channel: "telegram" },
        "cards",
      ),
    ).toBe(true);
    expect(
      channelSupportsMessageCapabilityForChannel({ cfg: {} as RemoteClawConfig }, "cards"),
    ).toBe(false);
  });

  it("normalizes channel aliases for per-channel capability checks", () => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "telegram",
          source: "test",
          plugin: createMessageActionsPlugin({
            id: "telegram",
            aliases: ["tg"],
            capabilities: ["cards"],
          }),
        },
      ]),
    );

    expect(
      listChannelMessageCapabilitiesForChannel({
        cfg: {} as RemoteClawConfig,
        channel: "tg",
      }),
    ).toEqual(["cards"]);
  });

  it("uses unified message tool discovery for actions, capabilities, and schema", () => {
    const unifiedPlugin: ChannelPlugin = {
      ...createChannelTestPluginBase({
        id: "discord",
        label: "Discord",
        capabilities: { chatTypes: ["direct", "group"] },
        config: {
          listAccountIds: () => ["default"],
        },
      }),
      actions: {
        describeMessageTool: () => ({
          actions: ["react"],
          capabilities: ["interactive"],
          schema: {
            properties: {
              components: Type.Array(Type.String()),
            },
          },
        }),
      },
    };
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "discord", source: "test", plugin: unifiedPlugin }]),
    );

    expect(listChannelMessageActions({} as RemoteClawConfig)).toEqual([
      "send",
      "broadcast",
      "react",
    ]);
    expect(listChannelMessageCapabilities({} as RemoteClawConfig)).toEqual(["interactive"]);
    expect(
      resolveChannelMessageToolSchemaProperties({
        cfg: {} as RemoteClawConfig,
        channel: "discord",
      }),
    ).toHaveProperty("components");
  });

  it("skips crashing action/capability discovery paths and logs once", () => {
    const crashingPlugin: ChannelPlugin = {
      ...createChannelTestPluginBase({
        id: "discord",
        label: "Discord",
        capabilities: { chatTypes: ["direct", "group"] },
        config: {
          listAccountIds: () => ["default"],
        },
      }),
      actions: {
        describeMessageTool: () => {
          throw new Error("boom");
        },
      },
    };
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "discord", source: "test", plugin: crashingPlugin }]),
    );

    expect(listChannelMessageActions({} as RemoteClawConfig)).toEqual(["send", "broadcast"]);
    expect(listChannelMessageCapabilities({} as RemoteClawConfig)).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    expect(listChannelMessageActions({} as RemoteClawConfig)).toEqual(["send", "broadcast"]);
    expect(listChannelMessageCapabilities({} as RemoteClawConfig)).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
