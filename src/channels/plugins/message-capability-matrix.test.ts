import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import type { ChannelMessageActionAdapter, ChannelPlugin } from "./types.js";

const telegramDescribeMessageToolMock = vi.fn();
const discordDescribeMessageToolMock = vi.fn();

const telegramPlugin: Pick<ChannelPlugin, "actions"> = {
  actions: {
    describeMessageTool: ({ cfg }) => telegramDescribeMessageToolMock({ cfg }),
    supportsAction: () => true,
  },
};

const discordPlugin: Pick<ChannelPlugin, "actions"> = {
  actions: {
    describeMessageTool: ({ cfg }) => discordDescribeMessageToolMock({ cfg }),
    supportsAction: () => true,
  },
};

// Keep this matrix focused on capability wiring. The extension packages already
// cover their own full channel/plugin boot paths, so local stubs are enough here.
const slackPlugin: Pick<ChannelPlugin, "actions"> = {
  actions: {
    describeMessageTool: ({ cfg }) => {
      const account = cfg.channels?.slack;
      const enabled =
        typeof account?.botToken === "string" &&
        account.botToken.trim() !== "" &&
        typeof account?.appToken === "string" &&
        account.appToken.trim() !== "";
      const capabilities = new Set<string>();
      if (enabled) {
        capabilities.add("blocks");
      }
      if (
        account?.capabilities &&
        (account.capabilities as { interactiveReplies?: unknown }).interactiveReplies === true
      ) {
        capabilities.add("interactive");
      }
      return {
        actions: enabled ? ["send"] : [],
        capabilities: Array.from(capabilities) as Array<"blocks" | "interactive">,
      };
    },
    supportsAction: () => true,
  },
};

const mattermostPlugin: Pick<ChannelPlugin, "actions"> = {
  actions: {
    describeMessageTool: ({ cfg }) => {
      const account = cfg.channels?.mattermost;
      const enabled =
        account?.enabled !== false &&
        typeof account?.botToken === "string" &&
        account.botToken.trim() !== "" &&
        typeof account?.baseUrl === "string" &&
        account.baseUrl.trim() !== "";
      return {
        actions: enabled ? ["send"] : [],
        capabilities: enabled ? (["buttons"] as const) : [],
      };
    },
    supportsAction: () => true,
  },
};

const feishuPlugin: Pick<ChannelPlugin, "actions"> = {
  actions: {
    describeMessageTool: ({ cfg }) => {
      const account = cfg.channels?.feishu;
      const enabled =
        account?.enabled !== false &&
        typeof account?.appId === "string" &&
        account.appId.trim() !== "" &&
        typeof account?.appSecret === "string" &&
        account.appSecret.trim() !== "";
      return {
        actions: enabled ? ["send"] : [],
        capabilities: enabled ? (["cards"] as const) : [],
      };
    },
    supportsAction: () => true,
  },
};

const msteamsPlugin: Pick<ChannelPlugin, "actions"> = {
  actions: {
    describeMessageTool: ({ cfg }) => {
      const account = cfg.channels?.msteams;
      const enabled =
        account?.enabled !== false &&
        typeof account?.tenantId === "string" &&
        account.tenantId.trim() !== "" &&
        typeof account?.appId === "string" &&
        account.appId.trim() !== "" &&
        typeof account?.appPassword === "string" &&
        account.appPassword.trim() !== "";
      return {
        actions: enabled ? ["poll"] : [],
        capabilities: enabled ? (["cards"] as const) : [],
      };
    },
    supportsAction: () => true,
  },
};

const zaloPlugin: Pick<ChannelPlugin, "actions"> = {
  actions: {
    describeMessageTool: () => ({ actions: [], capabilities: [] }),
    supportsAction: () => true,
  },
};

describe("channel action capability matrix", () => {
  afterEach(() => {
    telegramDescribeMessageToolMock.mockReset();
    discordDescribeMessageToolMock.mockReset();
  });

  function getCapabilities(plugin: Pick<ChannelPlugin, "actions">, cfg: RemoteClawConfig) {
    const describeMessageTool: ChannelMessageActionAdapter["describeMessageTool"] | undefined =
      plugin.actions?.describeMessageTool;
    return [...(describeMessageTool?.({ cfg })?.capabilities ?? [])];
  }

  it("exposes Slack blocks by default and interactive when enabled", () => {
    const baseCfg = {
      channels: {
        slack: {
          botToken: "xoxb-test",
          appToken: "xapp-test",
        },
      },
    } as RemoteClawConfig;
    const interactiveCfg = {
      channels: {
        slack: {
          botToken: "xoxb-test",
          appToken: "xapp-test",
          capabilities: { interactiveReplies: true },
        },
      },
    } as RemoteClawConfig;

    expect(getCapabilities(slackPlugin, baseCfg)).toEqual(["blocks"]);
    expect(getCapabilities(slackPlugin, interactiveCfg)).toEqual(["blocks", "interactive"]);
  });

  it("forwards Telegram action capabilities through the channel wrapper", () => {
    telegramDescribeMessageToolMock.mockReturnValue({
      capabilities: ["interactive", "buttons"],
    });

    const result = getCapabilities(telegramPlugin, {} as RemoteClawConfig);

    expect(result).toEqual(["interactive", "buttons"]);
    expect(telegramGetCapabilitiesMock).toHaveBeenCalledWith({ cfg: {} });
    discordGetCapabilitiesMock.mockReturnValue(["interactive", "components"]);

    const discordResult = discordPlugin.actions?.getCapabilities?.({ cfg: {} as OpenClawConfig });

    expect(discordResult).toEqual(["interactive", "components"]);
    expect(discordGetCapabilitiesMock).toHaveBeenCalledWith({ cfg: {} });
  });

  it("exposes configured channel capabilities only when required credentials are present", () => {
    const configuredCfg = {
      channels: {
        mattermost: {
          enabled: true,
          botToken: "mm-token",
          baseUrl: "https://chat.example.com",
        },
      },
    } as RemoteClawConfig;
    const unconfiguredCfg = {
      channels: {
        mattermost: {
          enabled: true,
        },
      },
    } as OpenClawConfig;
    const configuredFeishuCfg = {
      channels: {
        feishu: {
          enabled: true,
          appId: "cli_a",
          appSecret: "secret",
        },
      },
    } as OpenClawConfig;
    const disabledFeishuCfg = {
      channels: {
        feishu: {
          enabled: false,
          appId: "cli_a",
          appSecret: "secret",
        },
      },
    } as OpenClawConfig;
    const configuredMsteamsCfg = {
      channels: {
        msteams: {
          enabled: true,
          tenantId: "tenant",
          appId: "app",
          appPassword: "secret",
        },
      },
    } as OpenClawConfig;
    const disabledMsteamsCfg = {
      channels: {
        msteams: {
          enabled: false,
          tenantId: "tenant",
          appId: "app",
          appPassword: "secret",
        },
      },
    } as OpenClawConfig;

    expect(mattermostPlugin.actions?.getCapabilities?.({ cfg: configuredCfg })).toEqual([
      "buttons",
    ]);
    expect(mattermostPlugin.actions?.getCapabilities?.({ cfg: unconfiguredCfg })).toEqual([]);
    expect(feishuPlugin.actions?.getCapabilities?.({ cfg: configuredFeishuCfg })).toEqual([
      "cards",
    ]);
    expect(feishuPlugin.actions?.getCapabilities?.({ cfg: disabledFeishuCfg })).toEqual([]);
    expect(msteamsPlugin.actions?.getCapabilities?.({ cfg: configuredMsteamsCfg })).toEqual([
      "cards",
    ]);
    expect(msteamsPlugin.actions?.getCapabilities?.({ cfg: disabledMsteamsCfg })).toEqual([]);
  });

  it("keeps Zalo actions on the empty capability set", () => {
    const cfg = {
      channels: {
        zalo: {
          enabled: true,
          botToken: "zl-token",
        },
      },
    } as RemoteClawConfig;

    expect(getCapabilities(zaloPlugin, cfg)).toEqual([]);
  });
});
