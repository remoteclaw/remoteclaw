import { expect, vi } from "vitest";
import {
  __testing as discordThreadBindingTesting,
  createThreadBindingManager as createDiscordThreadBindingManager,
} from "../../../../extensions/discord/api.js";
import { createFeishuThreadBindingManager } from "../../../../extensions/feishu/api.js";
import { setMatrixRuntime } from "../../../../extensions/matrix/api.js";
import { createTelegramThreadBindingManager } from "../../../../extensions/telegram/api.js";
import type { RemoteClawConfig } from "../../../config/config.js";
import {
  getSessionBindingService,
  type SessionBindingCapabilities,
  type SessionBindingRecord,
} from "../../../infra/outbound/session-binding-service.js";
import {
  resolveDefaultLineAccountId,
  resolveLineAccount,
  listLineAccountIds,
} from "../../../line/accounts.js";
import type { ChannelPlugin } from "../types.js";

type PluginContractEntry = {
  id: string;
  plugin: Pick<ChannelPlugin, "id" | "meta" | "capabilities" | "config">;
};

type ActionsContractEntry = {
  id: string;
  plugin: Pick<ChannelPlugin, "id" | "actions">;
  unsupportedAction?: string;
  cases: Array<{
    name: string;
    cfg: RemoteClawConfig;
    expectedActions: string[];
    expectedCapabilities?: string[];
    beforeTest?: () => void;
  }>;
};

type SetupContractEntry = {
  id: string;
  plugin: Pick<ChannelPlugin, "id" | "config" | "setup">;
  cases: Array<{
    name: string;
    cfg: RemoteClawConfig;
    accountId?: string;
    input: Record<string, unknown>;
    expectedAccountId?: string;
    expectedValidation?: string | null;
    beforeTest?: () => void;
    assertPatchedConfig?: (cfg: RemoteClawConfig) => void;
    assertResolvedAccount?: (account: unknown, cfg: RemoteClawConfig) => void;
  }>;
};

type StatusContractEntry = {
  id: string;
  plugin: Pick<ChannelPlugin, "id" | "config" | "status">;
  cases: Array<{
    name: string;
    cfg: RemoteClawConfig;
    accountId?: string;
    runtime?: Record<string, unknown>;
    probe?: unknown;
    beforeTest?: () => void;
    assertSnapshot?: (snapshot: Record<string, unknown>) => void;
    assertSummary?: (summary: Record<string, unknown>) => void;
  }>;
};

const telegramListActionsMock = vi.fn();
const telegramGetCapabilitiesMock = vi.fn();
const discordListActionsMock = vi.fn();
const discordGetCapabilitiesMock = vi.fn();

setTelegramRuntime({
  channel: {
    telegram: {
      messageActions: {
        listActions: telegramListActionsMock,
        getCapabilities: telegramGetCapabilitiesMock,
      },
    },
  },
} as never);

setDiscordRuntime({
  channel: {
    discord: {
      messageActions: {
        listActions: discordListActionsMock,
        getCapabilities: discordGetCapabilitiesMock,
      },
    },
  },
} as never);

setLineRuntime({
  channel: {
    line: {
      listLineAccountIds,
      resolveDefaultLineAccountId,
      resolveLineAccount: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId?: string }) =>
        resolveLineAccount({ cfg, accountId }),
    },
  },
} as never);

export const pluginContractRegistry: PluginContractEntry[] = [
  { id: "bluebubbles", plugin: bluebubblesPlugin },
  { id: "discord", plugin: discordPlugin },
  { id: "feishu", plugin: feishuPlugin },
  { id: "googlechat", plugin: googlechatPlugin },
  { id: "imessage", plugin: imessagePlugin },
  { id: "irc", plugin: ircPlugin },
  { id: "line", plugin: linePlugin },
  { id: "matrix", plugin: matrixPlugin },
  { id: "mattermost", plugin: mattermostPlugin },
  { id: "msteams", plugin: msteamsPlugin },
  { id: "nextcloud-talk", plugin: nextcloudTalkPlugin },
  { id: "nostr", plugin: nostrPlugin },
  { id: "signal", plugin: signalPlugin },
  { id: "slack", plugin: slackPlugin },
  { id: "synology-chat", plugin: createSynologyChatPlugin() },
  { id: "telegram", plugin: telegramPlugin },
  { id: "tlon", plugin: tlonPlugin },
  { id: "whatsapp", plugin: whatsappPlugin },
  { id: "zalo", plugin: zaloPlugin },
  { id: "zalouser", plugin: zalouserPlugin },
];

export const actionContractRegistry: ActionsContractEntry[] = [
  {
    id: "slack",
    plugin: slackPlugin,
    unsupportedAction: "poll",
    cases: [
      {
        name: "configured account exposes default Slack actions",
        cfg: {
          channels: {
            slack: {
              botToken: "xoxb-test",
              appToken: "xapp-test",
            },
          },
        } as RemoteClawConfig,
        expectedActions: [
          "send",
          "react",
          "reactions",
          "read",
          "edit",
          "delete",
          "download-file",
          "pin",
          "unpin",
          "list-pins",
          "member-info",
          "emoji-list",
        ],
        expectedCapabilities: ["blocks"],
      },
      {
        name: "interactive replies add the shared interactive capability",
        cfg: {
          channels: {
            slack: {
              botToken: "xoxb-test",
              appToken: "xapp-test",
              capabilities: {
                interactiveReplies: true,
              },
            },
          },
        } as unknown as RemoteClawConfig,
        expectedActions: [
          "send",
          "react",
          "reactions",
          "read",
          "edit",
          "delete",
          "download-file",
          "pin",
          "unpin",
          "list-pins",
          "member-info",
          "emoji-list",
        ],
        expectedCapabilities: ["blocks", "interactive"],
      },
      {
        name: "missing tokens disables the actions surface",
        cfg: {
          channels: {
            slack: {
              enabled: true,
            },
          },
        } as RemoteClawConfig,
        expectedActions: [],
        expectedCapabilities: [],
      },
    ],
  },
  {
    id: "mattermost",
    plugin: mattermostPlugin,
    unsupportedAction: "poll",
    cases: [
      {
        name: "configured account exposes send and react",
        cfg: {
          channels: {
            mattermost: {
              enabled: true,
              botToken: "test-token",
              baseUrl: "https://chat.example.com",
            },
          },
        } as RemoteClawConfig,
        expectedActions: ["send", "react"],
        expectedCapabilities: ["buttons"],
      },
      {
        name: "reactions can be disabled while send stays available",
        cfg: {
          channels: {
            mattermost: {
              enabled: true,
              botToken: "test-token",
              baseUrl: "https://chat.example.com",
              actions: { reactions: false },
            },
          },
        } as RemoteClawConfig,
        expectedActions: ["send"],
        expectedCapabilities: ["buttons"],
      },
      {
        name: "missing bot credentials disables the actions surface",
        cfg: {
          channels: {
            mattermost: {
              enabled: true,
            },
          },
        } as RemoteClawConfig,
        expectedActions: [],
        expectedCapabilities: [],
      },
    ],
  },
  {
    id: "telegram",
    plugin: telegramPlugin,
    cases: [
      {
        name: "forwards runtime-backed Telegram actions and capabilities",
        cfg: {} as RemoteClawConfig,
        expectedActions: ["send", "poll", "react"],
        expectedCapabilities: ["interactive", "buttons"],
        beforeTest: () => {
          telegramListActionsMock.mockReset();
          telegramGetCapabilitiesMock.mockReset();
          telegramListActionsMock.mockReturnValue(["send", "poll", "react"]);
          telegramGetCapabilitiesMock.mockReturnValue(["interactive", "buttons"]);
        },
      },
    ],
  },
  {
    id: "discord",
    plugin: discordPlugin,
    cases: [
      {
        name: "forwards runtime-backed Discord actions and capabilities",
        cfg: {} as RemoteClawConfig,
        expectedActions: ["send", "react", "poll"],
        expectedCapabilities: ["interactive", "components"],
        beforeTest: () => {
          discordListActionsMock.mockReset();
          discordGetCapabilitiesMock.mockReset();
          discordListActionsMock.mockReturnValue(["send", "react", "poll"]);
          discordGetCapabilitiesMock.mockReturnValue(["interactive", "components"]);
        },
      },
    ],
  },
];

export const setupContractRegistry: SetupContractEntry[] = [
  {
    id: "slack",
    plugin: slackPlugin,
    cases: [
      {
        name: "default account stores tokens and enables the channel",
        cfg: {} as RemoteClawConfig,
        input: {
          botToken: "xoxb-test",
          appToken: "xapp-test",
        },
        expectedAccountId: "default",
        assertPatchedConfig: (cfg) => {
          expect(cfg.channels?.slack?.enabled).toBe(true);
          expect(cfg.channels?.slack?.botToken).toBe("xoxb-test");
          expect(cfg.channels?.slack?.appToken).toBe("xapp-test");
        },
      },
      {
        name: "non-default env setup is rejected",
        cfg: {} as RemoteClawConfig,
        accountId: "ops",
        input: {
          useEnv: true,
        },
        expectedAccountId: "ops",
        expectedValidation: "Slack env tokens can only be used for the default account.",
      },
    ],
  },
  {
    id: "mattermost",
    plugin: mattermostPlugin,
    cases: [
      {
        name: "default account stores token and normalized base URL",
        cfg: {} as RemoteClawConfig,
        input: {
          botToken: "test-token",
          httpUrl: "https://chat.example.com/",
        },
        expectedAccountId: "default",
        assertPatchedConfig: (cfg) => {
          expect(cfg.channels?.mattermost?.enabled).toBe(true);
          expect(cfg.channels?.mattermost?.botToken).toBe("test-token");
          expect(cfg.channels?.mattermost?.baseUrl).toBe("https://chat.example.com");
        },
      },
      {
        name: "missing credentials are rejected",
        cfg: {} as RemoteClawConfig,
        input: {
          httpUrl: "",
        },
        expectedAccountId: "default",
        expectedValidation: "Mattermost requires --bot-token and --http-url (or --use-env).",
      },
    ],
  },
  {
    id: "line",
    plugin: linePlugin,
    cases: [
      {
        name: "default account stores token and secret",
        cfg: {} as RemoteClawConfig,
        input: {
          channelAccessToken: "line-token",
          channelSecret: "line-secret",
        },
        expectedAccountId: "default",
        assertPatchedConfig: (cfg) => {
          expect(cfg.channels?.line?.enabled).toBe(true);
          expect(cfg.channels?.line?.channelAccessToken).toBe("line-token");
          expect(cfg.channels?.line?.channelSecret).toBe("line-secret");
        },
      },
      {
        name: "non-default env setup is rejected",
        cfg: {} as RemoteClawConfig,
        accountId: "ops",
        input: {
          useEnv: true,
        },
        expectedAccountId: "ops",
        expectedValidation: "LINE_CHANNEL_ACCESS_TOKEN can only be used for the default account.",
      },
    ],
  },
];

export const statusContractRegistry: StatusContractEntry[] = [
  {
    id: "slack",
    plugin: slackPlugin,
    cases: [
      {
        name: "configured account produces a configured status snapshot",
        cfg: {
          channels: {
            slack: {
              botToken: "xoxb-test",
              appToken: "xapp-test",
            },
          },
        } as RemoteClawConfig,
        runtime: {
          accountId: "default",
          connected: true,
          running: true,
        },
        probe: { ok: true },
        assertSnapshot: (snapshot) => {
          expect(snapshot.accountId).toBe("default");
          expect(snapshot.enabled).toBe(true);
          expect(snapshot.configured).toBe(true);
        },
      },
    ],
  },
  {
    id: "mattermost",
    plugin: mattermostPlugin,
    cases: [
      {
        name: "configured account preserves connectivity details in the snapshot",
        cfg: {
          channels: {
            mattermost: {
              enabled: true,
              botToken: "test-token",
              baseUrl: "https://chat.example.com",
            },
          },
        } as RemoteClawConfig,
        runtime: {
          accountId: "default",
          connected: true,
          lastConnectedAt: 1234,
        },
        probe: { ok: true },
        assertSnapshot: (snapshot) => {
          expect(snapshot.accountId).toBe("default");
          expect(snapshot.enabled).toBe(true);
          expect(snapshot.configured).toBe(true);
          expect(snapshot.connected).toBe(true);
          expect(snapshot.baseUrl).toBe("https://chat.example.com");
        },
      },
    ],
  },
  {
    id: "line",
    plugin: linePlugin,
    cases: [
      {
        name: "configured account produces a webhook status snapshot",
        cfg: {
          channels: {
            line: {
              enabled: true,
              channelAccessToken: "line-token",
              channelSecret: "line-secret",
            },
          },
        } as RemoteClawConfig,
        runtime: {
          accountId: "default",
          running: true,
        },
        probe: { ok: true },
        assertSnapshot: (snapshot) => {
          expect(snapshot.accountId).toBe("default");
          expect(snapshot.enabled).toBe(true);
          expect(snapshot.configured).toBe(true);
          expect(snapshot.mode).toBe("webhook");
        },
      },
    ],
  },
];
